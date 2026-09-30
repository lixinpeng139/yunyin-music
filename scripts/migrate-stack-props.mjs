#!/usr/bin/env node
/**
 * Material UI v9 dropped the system props (alignItems, justifyContent, ...) from
 * Stack, so each one has to move into `sx`.
 *
 * Uses the TypeScript compiler's own JSX parser, so nested braces, strings,
 * comments and multi-line tags are all handled correctly.
 *
 * Usage: node scripts/migrate-stack-props.mjs <files...>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import ts from 'typescript'

const SYSTEM_PROPS = new Set([
  'alignItems', 'justifyContent', 'flexWrap', 'flexDirection', 'alignContent',
  'alignSelf', 'gap', 'rowGap', 'columnGap', 'overflow', 'overflowX', 'overflowY',
  'display', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'position', 'flex', 'flexGrow', 'flexShrink', 'flexBasis',
])

/** Recursively finds every JSX element whose tag name is `Stack`. */
function findStackTags(node, out) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    const name = node.tagName.getText()
    if (name === 'Stack') out.push(node)
  }
  ts.forEachChild(node, (child) => findStackTags(child, out))
}

function processFile(path) {
  const source = readFileSync(path, 'utf8')
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const tags = []
  findStackTags(file, tags)

  const edits = []
  for (const tag of tags) {
    const props = tag.attributes.properties
    const moves = props.filter(
      (prop) => ts.isJsxAttribute(prop) && SYSTEM_PROPS.has(prop.name.getText()),
    )
    if (!moves.length) continue

    const additions = moves.map((attr) => {
      const initializer = attr.initializer
      let value
      if (!initializer) value = 'true'
      else if (ts.isStringLiteral(initializer)) value = `'${initializer.text}'`
      else if (ts.isJsxExpression(initializer) && initializer.expression) {
        value = initializer.expression.getText()
      } else value = 'true'
      return `${attr.name.getText()}: ${value}`
    })

    const sxAttr = props.find((prop) => ts.isJsxAttribute(prop) && prop.name.getText() === 'sx')

    if (sxAttr && sxAttr.initializer && ts.isJsxExpression(sxAttr.initializer) && sxAttr.initializer.expression) {
      const expr = sxAttr.initializer.expression
      // The object literal's existing members are preserved verbatim; the moved
      // props are prepended so later members still win, as they did before.
      if (ts.isObjectLiteralExpression(expr) && expr.properties.length) {
        const first = expr.properties[0]
        edits.push({
          start: first.getStart(file),
          end: first.getStart(file),
          text: `${additions.join(', ')}, `,
        })
      } else {
        edits.push({
          start: expr.getStart(file),
          end: expr.getEnd(),
          text: `{ ${additions.join(', ')}, ...(${expr.getText()}) }`,
        })
      }
    } else if (sxAttr) {
      edits.push({
        start: sxAttr.getStart(file),
        end: sxAttr.getEnd(),
        text: `sx={{ ${additions.join(', ')} }}`,
      })
    } else {
      const insertAt = tag.attributes.end
      edits.push({ start: insertAt, end: insertAt, text: ` sx={{ ${additions.join(', ')} }}` })
    }

    // Remove the moved attributes, including one run of leading whitespace so
    // the tag does not end up with a blank line.
    for (const attr of moves) {
      let start = attr.getStart(file)
      while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start -= 1
      let end = attr.getEnd()
      if (source[end] === ',') end += 1
      // When the attribute owned its own line, swallow that whole line so the
      // tag does not keep a blank row where the prop used to be.
      const lineStart = source.lastIndexOf('\n', start - 1) + 1
      const onlyWhitespaceBefore = /^[ \t]*$/.test(source.slice(lineStart, start))
      const afterOnLine = source.slice(end, source.indexOf('\n', end) === -1 ? undefined : source.indexOf('\n', end))
      if (onlyWhitespaceBefore && /^[ \t]*$/.test(afterOnLine)) {
        start = lineStart
        const newline = source.indexOf('\n', end)
        end = newline === -1 ? end : newline + 1
      }
      edits.push({ start, end, text: '' })
    }
  }

  if (!edits.length) return false

  edits.sort((a, b) => b.start - a.start || b.end - a.end)
  let output = source
  for (const edit of edits) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end)
  }
  // Collapse the whitespace left on lines that held only a removed attribute.
  output = output.replace(/[ \t]+\n/g, '\n')
  writeFileSync(path, output)
  return true
}

let count = 0
for (const file of process.argv.slice(2)) {
  try {
    if (processFile(file)) {
      count += 1
      console.log(`rewrote ${file}`)
    }
  } catch (error) {
    console.error(`failed on ${file}: ${error.stack}`)
  }
}
console.log(`done: ${count} file(s) changed`)
