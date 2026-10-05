export interface SanitizationResult {
  sanitizedText: string;
  redactedCount: number;
  typesDetected: string[];
  findings: Array<{
    type: string;
    original: string;
    replacement: string;
  }>;
}

// Luhn algorithm validator for Credit Card numbers
export function isValidLuhn(ccNumber: string): boolean {
  const digits = ccNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

// High performance regex rules
const REGEX_RULES = [
  {
    type: 'EMAIL',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replaceTag: '[REDACTED_EMAIL]',
  },
  {
    type: 'SSN',
    regex: /\b(?!000|666|9\d{2})\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}\b/g,
    replaceTag: '[REDACTED_SSN]',
  },
  {
    type: 'JWT_TOKEN',
    regex: /\beyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*\b/g,
    replaceTag: '[REDACTED_JWT_TOKEN]',
  },
  {
    type: 'API_KEY',
    // Matches GitHub tokens, AWS keys (AKIA...), OpenAI sk-..., Generic Bearer keys
    regex: /\b(?:ghp_[a-zA-Z0-9]{36}|AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{20,48}|Bearer\s+[a-zA-Z0-9_\-\.]{25,})\b/gi,
    replaceTag: '[REDACTED_API_KEY]',
  },
  {
    type: 'PHONE_NUMBER',
    // Standard international and US phone formats
    regex: /(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})\b/g,
    replaceTag: '[REDACTED_PHONE]',
  },
  {
    type: 'IPV4_ADDRESS',
    regex: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    replaceTag: '[REDACTED_IP_ADDRESS]',
  },
];

export class PiiSanitizer {
  /**
   * Scans and sanitizes raw input text, stripping PII & secrets with < 5ms latency
   */
  public static sanitize(text: string): SanitizationResult {
    let sanitizedText = text;
    const typesDetected = new Set<string>();
    const findings: SanitizationResult['findings'] = [];
    let redactedCount = 0;

    // 1. Credit Card Check with Luhn validation
    const ccCandidateRegex = /\b(?:\d[ -]*?){13,19}\b/g;
    sanitizedText = sanitizedText.replace(ccCandidateRegex, (match) => {
      const cleanDigits = match.replace(/[\s-]/g, '');
      if (cleanDigits.length >= 13 && cleanDigits.length <= 19 && isValidLuhn(cleanDigits)) {
        redactedCount++;
        typesDetected.add('CREDIT_CARD');
        findings.push({
          type: 'CREDIT_CARD',
          original: match,
          replacement: '[REDACTED_CREDIT_CARD]',
        });
        return '[REDACTED_CREDIT_CARD]';
      }
      return match;
    });

    // 2. Scan standard regex patterns
    for (const rule of REGEX_RULES) {
      sanitizedText = sanitizedText.replace(rule.regex, (match) => {
        // Skip if already a redaction tag
        if (match.startsWith('[REDACTED_') && match.endsWith(']')) {
          return match;
        }

        redactedCount++;
        typesDetected.add(rule.type);
        findings.push({
          type: rule.type,
          original: match,
          replacement: rule.replaceTag,
        });
        return rule.replaceTag;
      });
    }

    return {
      sanitizedText,
      redactedCount,
      typesDetected: Array.from(typesDetected),
      findings,
    };
  }

  /**
   * Sanitizes structured messages array in OpenAI completions format
   */
  public static sanitizeMessages(messages: Array<{ role: string; content: string; [key: string]: any }>) {
    let totalRedacted = 0;
    const allTypes = new Set<string>();
    const allFindings: SanitizationResult['findings'] = [];

    const sanitizedMessages = messages.map((msg) => {
      if (typeof msg.content === 'string') {
        const result = PiiSanitizer.sanitize(msg.content);
        totalRedacted += result.redactedCount;
        result.typesDetected.forEach((t) => allTypes.add(t));
        allFindings.push(...result.findings);
        return {
          ...msg,
          content: result.sanitizedText,
        };
      }
      return msg;
    });

    return {
      sanitizedMessages,
      totalRedacted,
      typesDetected: Array.from(allTypes),
      findings: allFindings,
    };
  }
}
