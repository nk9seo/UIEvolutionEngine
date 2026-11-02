import { Workspace } from "@/components/workspace/workspace";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { p } = await searchParams;
  return <Workspace initialProjectId={typeof p === "string" && /^p_[a-z0-9]{6,32}$/.test(p) ? p : null} />;
}
