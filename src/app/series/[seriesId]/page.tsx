import { notFound } from "next/navigation";
import { ChatInterface } from "@/components/ChatInterface";
import { getSeriesById } from "@/lib/catalog";

type SeriesPageProps = {
  params: Promise<{ seriesId: string }>;
};

export default async function SeriesPage({ params }: SeriesPageProps) {
  const { seriesId } = await params;
  const series = getSeriesById(seriesId);
  if (!series) notFound();

  return <ChatInterface series={series} />;
}
