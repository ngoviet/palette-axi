import { AxiError } from "axi-sdk-js";

// Mã lỗi của tool. SDK chỉ map VALIDATION_ERROR → exit 2; mọi mã khác → exit 1.
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND" // file/thư mục không tồn tại
  | "ISSUES_FOUND"; // analyze --strict gặp vi phạm nguyên tắc

export function fail(message: string, code: ErrorCode, help: string[] = []): never {
  throw new AxiError(message, code, help);
}

export { AxiError };
