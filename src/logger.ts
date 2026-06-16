export type LogFields = Record<string, string | number | boolean | null | undefined>;

export class Logger {
  info(message: string, fields: LogFields = {}): void {
    this.write("info", message, fields);
  }

  warn(message: string, fields: LogFields = {}): void {
    this.write("warn", message, fields);
  }

  error(message: string, fields: LogFields = {}): void {
    this.write("error", message, fields);
  }

  private write(level: string, message: string, fields: LogFields): void {
    const entry: LogFields = {
      level,
      message,
      ...fields
    };

    process.stderr.write(`${JSON.stringify(entry)}\n`);
  }
}

export const logger = new Logger();
