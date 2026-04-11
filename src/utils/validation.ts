import { ValidationError } from "./errors.js";

interface ValidationOptions {
  maxLength?: number;
  minLength?: number;
  required?: boolean;
}

function validateLength(
  input: string | undefined,
  options: ValidationOptions = {},
): void {
  const { maxLength = 256, minLength = 1, required = true } = options;

  if (required && !input) {
    throw new ValidationError("缺少必填参数。");
  }
  if (!input) {
    return;
  }
  if (input.length < minLength) {
    throw new ValidationError(`输入长度不能少于 ${minLength} 个字符。`);
  }
  if (input.length > maxLength) {
    throw new ValidationError(`输入长度不能超过 ${maxLength} 个字符。`);
  }
}

export function validateVideoInput(input: string): void {
  validateLength(input, { maxLength: 512, minLength: 1, required: true });
}

export function validateKeyword(input: string): void {
  validateLength(input, { maxLength: 100, minLength: 1, required: true });
}

export function validateLanguage(lang?: string): void {
  if (!lang) {
    return;
  }
  validateLength(lang, { maxLength: 12, minLength: 2, required: false });
  if (!/^[a-z]{2}(-[A-Za-z]{2,})?$/.test(lang)) {
    throw new ValidationError("字幕语言代码格式不正确。");
  }
}

export function validateDetailLevel(level?: string): void {
  if (!level) {
    return;
  }
  if (!["brief", "detailed"].includes(level)) {
    throw new ValidationError('detail_level 仅支持 "brief" 或 "detailed"。');
  }
}

export function validatePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${fieldName} 必须是正整数。`);
  }
}
