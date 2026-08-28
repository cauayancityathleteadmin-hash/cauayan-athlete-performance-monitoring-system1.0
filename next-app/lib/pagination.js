export const PAGE_SIZE = 50;

export function pageArgs(page) {
  const current = Number.isSafeInteger(page) && page > 0 ? page : 1;
  return {
    current,
    skip: (current - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
  };
}

export function totalPages(totalCount) {
  return Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
}

export async function paginatePrisma(modelClient, page, options) {
  const current = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const skip = (current - 1) * PAGE_SIZE;
  const [rows, count] = await Promise.all([
    modelClient.findMany({ ...options, skip, take: PAGE_SIZE + 1 }),
    modelClient.count({ where: options.where }),
  ]);
  const hasNext = rows.length > PAGE_SIZE;
  const items = hasNext ? rows.slice(0, PAGE_SIZE) : rows;
  return {
    items,
    page: current,
    total: count,
    totalPages: totalPages(count),
    hasNext,
  };
}
