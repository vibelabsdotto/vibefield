"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import type { Campaign } from "@vibefield/contracts";
import { useAction, useList } from "@/lib/api";
import {
  EmptyState,
  Loading,
  PageHeader,
  QueryError,
  StatusBadge,
  TextField,
} from "@/components/studio";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CampaignFields, campaignValues } from "./campaign-form";

function CreateCampaign() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(campaignValues);
  const action = useAction<Campaign>("Campaign created");
  const router = useRouter();
  return (
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
        New campaign
      </DialogTrigger>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        showCloseButton={!action.isPending}
      >
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>
            Start with a brief. Build and review each shot before making a
            video.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-w-0 flex-col gap-6"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              const campaign = await action.mutateAsync({
                path: "/campaigns",
                body: { ...draft, name: draft.name.trim() },
              });
              setOpen(false);
              setDraft(campaignValues());
              router.push(`/campaigns/${campaign.id}`);
            } catch {
              /* The mutation error remains in the form. */
            }
          }}
        >
          <CampaignFields
            value={draft}
            onChange={setDraft}
            disabled={action.isPending}
          />
          {action.error && <QueryError error={action.error} />}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={action.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={action.isPending || !draft.name.trim()}
            >
              {action.isPending ? "Creating…" : "Create campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CampaignList() {
  const campaigns = useList<Campaign>("/campaigns");
  const [search, setSearch] = useState("");
  const visible = campaigns.items.filter((campaign) =>
    `${campaign.name} ${campaign.productName}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="page-stack">
      <PageHeader
        title="Campaigns"
        description="Plan the story. Approve the frame. Then bring it to life."
        actions={<CreateCampaign />}
      />
      {campaigns.isPending && <Loading />}
      {campaigns.error && (
        <QueryError
          error={campaigns.error}
          retry={() => void campaigns.refetch()}
        />
      )}
      {!campaigns.isPending &&
        !campaigns.error &&
        campaigns.items.length === 0 && (
          <EmptyState
            title="Your first campaign starts with a brief"
            description="Bring a product and a character together, then build a sequence of shots. Nothing generates automatically."
          />
        )}
      {campaigns.items.length > 0 && (
        <>
          <div className="max-w-sm">
            <TextField
              label="Find a campaign"
              value={search}
              onChange={setSearch}
              placeholder="Search loaded campaigns"
            />
          </div>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="hidden sm:table-cell">Format</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Updated
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="max-w-48 whitespace-normal py-4">
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        className="font-medium break-words underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {campaign.name}
                      </Link>
                      <p className="mt-1 text-xs break-words text-muted-foreground">
                        {campaign.productName || "No product assigned"}
                      </p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {campaign.format}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={campaign.status} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {new Intl.DateTimeFormat("en", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      }).format(new Date(campaign.updatedAt))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {visible.length === 0 && (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                <Search aria-hidden className="size-4" />
                No matching loaded campaigns.
              </div>
            )}
          </div>
          {campaigns.hasNextPage && (
            <div>
              <Button
                variant="outline"
                disabled={campaigns.isFetchingNextPage}
                onClick={() => void campaigns.fetchNextPage()}
              >
                {campaigns.isFetchingNextPage
                  ? "Loading…"
                  : "Load more campaigns"}
              </Button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Identity lives with your{" "}
            <Link
              className={buttonVariants({
                variant: "link",
                className: "h-auto p-0",
              })}
              href="/characters"
            >
              characters
            </Link>
            . Campaigns bring them into a story.
          </p>
        </>
      )}
    </div>
  );
}
