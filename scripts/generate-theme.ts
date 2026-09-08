import { readFile, writeFile } from 'node:fs/promises';

export async function generateTheme(): Promise<void> {
  const xml = await readFile('vendor/themes/DefaultColorSchemesManager.xml', 'utf8');
  const scheme = xml.match(/<scheme name="Darcula"[\s\S]*?<\/scheme>/)?.[0];
  if (!scheme) throw new Error('Darcula scheme not found');
  function color(name: string): string {
    const value = scheme!.match(new RegExp(`<option name="${name}" value="([a-fA-F0-9]+)"`))?.[1];
    if (!value) throw new Error(`Missing Darcula color ${name}`);
    return value.toLowerCase();
  }
  function attribute(name: string, part = 'FOREGROUND'): string {
    const group = scheme!.match(new RegExp(`<option name="${name}">([\\s\\S]*?)</value>`))?.[1];
    const value = group?.match(new RegExp(`<option name="${part}" value="([a-fA-F0-9]+)"`))?.[1];
    if (!value) throw new Error(`Missing Darcula attribute ${name}.${part}`);
    return value.toLowerCase();
  }
  const text = attribute('TEXT');
  const theme = {
    base: 'vs-dark',
    inherit: true,
    rules: [
      ['', text],
      ['keyword', attribute('DEFAULT_KEYWORD')],
      ['string', attribute('DEFAULT_STRING')],
      ['number', attribute('DEFAULT_NUMBER')],
      ['comment', attribute('DEFAULT_LINE_COMMENT')],
      ['function', attribute('DEFAULT_FUNCTION_DECLARATION')],
      ['type', attribute('DEFAULT_CLASS_REFERENCE')],
      ['identifier', text],
      ['delimiter', text],
    ].map(([token, foreground]) => ({ token, foreground })),
    colors: {
      'editor.background': '#' + attribute('TEXT', 'BACKGROUND'),
      'editor.foreground': '#' + text,
      'editor.selectionBackground': '#' + color('SELECTION_BACKGROUND'),
      'editorCursor.foreground': '#' + color('CARET_COLOR'),
      'editor.lineHighlightBackground': '#' + color('CARET_ROW_COLOR'),
      'editorLineNumber.foreground': '#' + color('LINE_NUMBERS_COLOR'),
      'editorWidget.background': '#' + color('LOOKUP_COLOR'),
    },
  };
  await writeFile('src/generated/darcula.json', JSON.stringify(theme, null, 2) + '\n');
}
