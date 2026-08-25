import { ImageBrowser } from "@/components/images/ImageBrowser";
import { requireAuth } from "@/lib/auth/require-auth";
import { listStoredImages } from "@/lib/images/queries";
import { parseImageSort, sortImages } from "@/lib/images/sort";

/**
 * Every image in the collection. Its own route rather than a query string on
 * the index: the rail links to it, and a view the rail can select ought to be
 * a place rather than a mode.
 *
 * The order *is* a query string, though — it's a way of looking at this one
 * place rather than a place of its own. Sorting here rather than in the browser
 * keeps the grid server-rendered; see [ImageSortControl].
 */
export default async function ImagesPage(props: PageProps<"/images">) {
  await requireAuth();
  const sort = parseImageSort((await props.searchParams).sort);
  const images = await listStoredImages();

  return <ImageBrowser images={sortImages(images, sort)} sort={sort} />;
}
