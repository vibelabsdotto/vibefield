"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, UserRound } from "lucide-react";
import type { Character } from "@vibefield/contracts";
import { thumbUrl, useAction, useList } from "@/lib/api";
import {
  EmptyState,
  Loading,
  PageHeader,
  QueryError,
  StatusBadge,
  TextField,
} from "@/components/studio";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function CharactersList() {
  const query = useList<Character>("/characters");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const router = useRouter();
  const action = useAction<Character>("Character created");
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || action.isPending) return;
    try {
      const character = await action.mutateAsync({
        path: "/characters",
        body: { name: name.trim(), description, appearance: {}, persona: {} },
      });
      setOpen(false);
      router.push(`/characters/${character.id}`);
    } catch {
      /* Inputs stay intact. */
    }
  }
  const createDialog = (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (action.isPending) {
          details.cancel();
          return;
        }
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" />
        New character
      </DialogTrigger>
      <DialogContent
        showCloseButton={!action.isPending}
        className="sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>Create a character</DialogTitle>
          <DialogDescription>
            Start with a name and a visual direction. You choose the identity
            anchor later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={create} className="flex flex-col gap-5">
          <FieldGroup>
            <TextField
              label="Character name"
              required
              value={name}
              onChange={setName}
              disabled={action.isPending}
            />
            <TextField
              label="Visual direction"
              multiline
              value={description}
              onChange={setDescription}
              disabled={action.isPending}
              placeholder="Describe the person and the visual feel you want."
            />
          </FieldGroup>
          <QueryError error={action.error} />
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              disabled={action.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || action.isPending}>
              {action.isPending ? "Creating…" : "Create character"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
  const filtered = query.items.filter((c) =>
    `${c.name} ${c.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="page-stack">
      <PageHeader
        title="Characters"
        description="Build an identity once. Keep it consistent across every frame."
        actions={createDialog}
      />
      {query.items.length > 0 && (
        <Input
          aria-label="Filter loaded characters"
          placeholder="Find a character…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-sm"
        />
      )}
      {query.isPending && <Loading />}
      <QueryError error={query.error} retry={() => void query.refetch()} />
      {!query.isPending && !query.error && filtered.length === 0 && (
        <EmptyState
          title={search ? "No matching characters" : "Your cast starts here"}
          description={
            search
              ? "Try a different name, or load more characters below."
              : "Create a character, then upload or generate a portrait to establish their identity."
          }
        />
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((character) => (
          <Link
            key={character.id}
            href={`/characters/${character.id}`}
            className="min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full gap-0 overflow-hidden py-0">
              <div className="relative aspect-[4/5] overflow-hidden bg-muted">
                {character.canonicalAssetId ? (
                  <CharacterCover
                    id={character.canonicalAssetId}
                    name={character.name}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                    <UserRound className="size-5" />
                    No identity anchor
                  </div>
                )}
              </div>
              <CardHeader className="p-4 pb-2">
                <CardTitle>{character.name}</CardTitle>
                <CardDescription className="line-clamp-2">
                  {character.description ||
                    "Add an appearance and choose a canonical portrait."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 pt-2">
                <StatusBadge status={character.status} />
                <span className="text-xs text-muted-foreground">
                  Identity v{character.identityVersion}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {query.hasNextPage && (
        <div>
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Load more characters
          </Button>
        </div>
      )}
    </div>
  );
}
function CharacterCover({ id, name }: { id: string; name: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbUrl(id)}
      alt={name}
      className="absolute inset-0 size-full object-cover object-top"
    />
  );
}
