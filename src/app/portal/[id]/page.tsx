import Portal from "./Portal";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const { t } = await searchParams;
  return <Portal id={id} token={t ?? ""} />;
}
