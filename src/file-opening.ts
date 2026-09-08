export function fileKind(name: string) {
  const extension = name.slice(name.lastIndexOf('.')).toLowerCase();
  return extension === '.jal'
    ? 'source'
    : extension === '.class'
      ? 'class'
      : extension === '.jalprj'
        ? 'project'
        : undefined;
}
/** A real file input keeps picker activation in the window receiving the gesture. */
export function installFilePicker(open: (files: File[]) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.jal,.class,.jalprj';
  input.multiple = true;
  input.hidden = true;
  input.id = 'file-input';
  document.body.append(input);
  input.onchange = () => {
    const files = [...(input.files ?? [])];
    input.value = '';
    open(files);
  };
  return { open: () => input.click(), dispose: () => input.remove() };
}
