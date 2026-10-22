import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

function files(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(directory, entry.name))
        : entry.name.endsWith(".tsx")
          ? [path.join(directory, entry.name)]
          : [],
    );
}
it("keeps visible JSX copy and accessible labels in centralized dictionaries", () => {
  const failures: string[] = [];
  const technicalText = new Set(["clearledger", "CL", "SHA-256"]);
  for (const file of files("src")) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function walk(node: ts.Node) {
      if (ts.isJsxText(node)) {
        const value = node.text.trim();
        if (/\p{L}/u.test(value) && !technicalText.has(value))
          failures.push(`${file}: hardcoded JSX copy: ${value}`);
      }
      if (
        ts.isJsxAttribute(node) &&
        ["aria-label", "placeholder", "title", "alt"].includes(
          node.name.getText(source),
        ) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer)
      ) {
        const value = node.initializer.text;
        if (value && !/^https?:\/\//.test(value))
          failures.push(`${file}: hardcoded accessible text: ${value}`);
      }
      ts.forEachChild(node, walk);
    }
    walk(source);
  }
  expect(failures).toEqual([]);
});
