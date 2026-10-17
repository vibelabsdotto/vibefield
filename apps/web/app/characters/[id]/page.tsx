import { CharacterWorkspace } from "@/components/characters/character-workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CharacterWorkspace id={id} />;
}
