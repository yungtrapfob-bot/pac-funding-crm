// PostgREST caps the number of rows in a single response. Supply a stable sort
// on the query so reporting can traverse the full result set.
export async function readPages<Row>(readPage: (from: number, to: number) => PromiseLike<{
  data: Row[] | null;
  error: { message: string } | null;
}>) {
  const pageSize = 500;
  const rows: Row[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await readPage(offset, offset + pageSize - 1);
    if (error) throw new Error(`Could not load report data: ${error.message}`);
    if (!data?.length) return rows;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}
