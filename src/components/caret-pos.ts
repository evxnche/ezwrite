// Minimal helper to get x/y coordinates of a caret in a textarea.

export function getCaretCoordinates(element: HTMLTextAreaElement, position: number): { top: number, left: number, height: number } {
  // Create a clone div
  const div = document.createElement('div');
  const style = div.style;
  const computed = window.getComputedStyle(element);

  style.whiteSpace = 'pre-wrap';
  style.wordWrap = 'break-word';
  style.position = 'absolute';
  style.visibility = 'hidden';
  
  // Copy relevant properties
  const properties = [
    'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily',
    'textAlign', 'textTransform', 'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize', 'MozTabSize'
  ];

  properties.forEach((prop: any) => {
    style[prop] = computed[prop as keyof CSSStyleDeclaration] as string;
  });

  // Populate content up to caret
  div.textContent = element.value.substring(0, position);
  
  // Special case: if the text ends with a newline, add a space so it gets rendered
  if (element.value[position - 1] === '\n') {
    div.textContent += ' ';
  }

  const span = document.createElement('span');
  span.textContent = element.value.substring(position) || '.';
  div.appendChild(span);

  document.body.appendChild(div);

  const coordinates = {
    top: span.offsetTop + parseInt(computed.borderTopWidth),
    left: span.offsetLeft + parseInt(computed.borderLeftWidth),
    height: parseInt(computed.lineHeight)
  };

  document.body.removeChild(div);

  return coordinates;
}
