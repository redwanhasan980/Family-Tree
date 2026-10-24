/**
 * Splits rows of known heights into pages (the List export, DESIGN §14): rows never
 * break, and the first page has less room because of the title. A row taller than a
 * page gets a page of its own.
 */
export function paginate(
  heights: readonly number[],
  pageH: number,
  firstPageH: number,
): number[][] {
  const pages: number[][] = [];
  let page: number[] = [];
  let room = firstPageH;
  heights.forEach((height, index) => {
    if (page.length > 0 && height > room) {
      pages.push(page);
      page = [];
      room = pageH;
    }
    page.push(index);
    room -= height;
  });
  if (page.length > 0 || pages.length === 0) pages.push(page);
  return pages;
}
