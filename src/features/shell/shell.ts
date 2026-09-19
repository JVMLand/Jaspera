import { renderTemplate } from '../../i18n/template';
import shell from './shell.html?raw';
import dialog from './dialog.html?raw';
import properties from '../project/properties.html?raw';
import theme from '../appearance/theme.html?raw';

const template = shell
  .replace('<!-- dialog -->', dialog)
  .replace('<!-- project-properties -->', properties)
  .replace('<!-- theme-dialog -->', theme);

export function renderShell(brand: readonly [string, string]) {
  return renderTemplate(template, brand);
}
