import { ImageBrowser } from "@/components/images/ImageBrowser";
import { requireAuth } from "@/lib/auth/require-auth";
import { listStoredImages } from "@/lib/images/queries";
import { parseImageSort, sortImages } from "@/lib/images/sort";

/**
 * Every image in the collection. Its own route (the sidebar links to it); the
 * sort order is a query string. Sorted here to keep the grid server-rendered
 * (see [ImageSortControl]).
 */
export default async function ImagesPage(props: PageProps<"/images">) {
  await requireAuth();
  const sort = parseImageSort((await props.searchParams).sort);
  const images = await listStoredImages();

  return <ImageBrowser images={sortImages(images, sort)} sort={sort} />;
}
