import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

export type Ask = (question: string, opts?: { hidden?: boolean }) => Promise<string>;

/**
 * Terminal questions with Node's readline. `hidden` answers (keys) are not echoed: the line editor writes through a
 * stream that drops output while muted.
 */
export function terminalPrompter(input: NodeJS.ReadStream = process.stdin, output: NodeJS.WriteStream = process.stdout) {
  let muted = false;
  const sink = new Writable({
    write(chunk, encoding, cb) {
      if (!muted) output.write(chunk, encoding as BufferEncoding);
      cb();
    },
  });
  const rl = createInterface({ input, output: sink, terminal: !!input.isTTY });
  rl.on("SIGINT", () => {
    output.write("\nCanceled.\n");
    rl.close();
    process.exit(130);
  });
  const ask: Ask = async (question, opts = {}) => {
    // Visible prompts go through readline, which redraws its prompt as you type; hidden ones are written once,
    // then the muted line editor (prompt "") echoes nothing.
    if (!opts.hidden) return (await rl.question(question)).trim();
    output.write(question);
    muted = true;
    try {
      return (await rl.question("")).trim();
    } finally {
      muted = false;
      output.write("\n");
    }
  };
  return { ask, close: () => rl.close() };
}
