import { config } from "../config.js";
import { ValidationError } from "./errors.js";

interface ValidationOptions {
  maxLength?: number;
  minLength?: number;
  required?: boolean;
}

function validateLength(
  input: string | undefined,
  fieldName: string,
  options: ValidationOptions = {},
): void {
  const { maxLength = 256, minLength = 1, required = true } = options;

  if (required && !input) {
    throw new ValidationError(`缺少必填参数：${fieldName}。`, {
      fieldErrors: [{ field: fieldName, message: "该字段不能为空。", expected: "提供非空字符串" }],
    });
  }
  if (!input) {
    return;
  }
  if (input.length < minLength) {
    throw new ValidationError(`${fieldName} 长度不能少于 ${minLength} 个字符。`, {
      fieldErrors: [
        {
          field: fieldName,
          message: `${fieldName} 长度过短。`,
          received: input,
          expected: `至少 ${minLength} 个字符`,
        },
      ],
    });
  }
  if (input.length > maxLength) {
    throw new ValidationError(`${fieldName} 长度不能超过 ${maxLength} 个字符。`, {
      fieldErrors: [
        {
          field: fieldName,
          message: `${fieldName} 长度过长。`,
          received: input,
          expected: `最多 ${maxLength} 个字符`,
        },
      ],
    });
  }
}

export function validateVideoInput(input: string): void {
  validateLength(input, "input", { maxLength: 512, minLength: 1, required: true });
}

export function validateKeyword(input: string): void {
  validateLength(input, "keyword", { maxLength: 100, minLength: 1, required: true });
}

export function validateLanguage(lang?: string): void {
  if (!lang) {
    return;
  }
  validateLength(lang, "preferred_lang", { maxLength: 12, minLength: 2, required: false });
  if (!/^[a-z]{2}(-[A-Za-z]{2,})?$/.test(lang)) {
    throw new ValidationError("字幕语言代码格式不正确。", {
      fieldErrors: [
        {
          field: "preferred_lang",
          message: "语言代码格式不正确。",
          received: lang,
          expected: '形如 "zh-Hans"、"zh-CN"、"en"',
          allowed_values: config.supportedLanguages,
        },
      ],
    });
  }
}

export function validateSupportedLanguage(lang?: string): void {
  if (!lang) {
    return;
  }
  if (!config.supportedLanguages.includes(lang)) {
    throw new ValidationError("字幕语言不受支持。", {
      fieldErrors: [
        {
          field: "preferred_lang",
          message: "当前服务不支持该字幕语言。",
          received: lang,
          allowed_values: config.supportedLanguages,
          expected: `支持的语言：${config.supportedLanguages.join(", ")}`,
        },
      ],
    });
  }
}

export function validateDetailLevel(level?: string): void {
  if (!level) {
    return;
  }
  if (!["brief", "detailed"].includes(level)) {
    throw new ValidationError('detail_level 仅支持 "brief" 或 "detailed"。', {
      fieldErrors: [
        {
          field: "detail_level",
          message: "评论返回粒度不合法。",
          received: level,
          allowed_values: ["brief", "detailed"],
        },
      ],
    });
  }
}

export function validatePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${fieldName} 必须是正整数。`, {
      fieldErrors: [
        {
          field: fieldName,
          message: `${fieldName} 必须是大于 0 的整数。`,
          received: value,
          expected: "正整数",
        },
      ],
    });
  }
}
