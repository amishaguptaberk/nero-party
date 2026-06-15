import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_URL = "http://127.0.0.1:4100";

type Track = {
  provider: "itunes";
  providerId: string;
  title: string;
  artist: string;
  album?: string | null;
  artworkUrl?: string | null;
  previewUrl: string;
  durationMs?: number | null;
};

type PartySnapshot = {
  code: string;
  name: string;
  maxSongs: number;
  status: "LOBBY" | "LIVE" | "ENDED";
  participants: Array<{ id: string; name: string; isHost: boolean }>;
  currentItem?: { id: string; track: Track; votes: number; cheers: number } | null;
  queue: Array<{ id: string; track: Track; votes: number; cheers: number; addedByName?: string | null }>;
  winner?: { title: string; artist: string; cheers: number; queueUpvotes: number; score: number } | null;
};

const tracks: Track[] = [
  {
    provider: "itunes",
    providerId: "e2e-neon",
    title: "Neon Tilt",
    artist: "Nero Party",
    album: "Depth Check",
    artworkUrl: "https://example.com/neon.jpg",
    previewUrl: "https://example.com/neon.m4a",
    durationMs: 30_000,
  },
  {
    provider: "itunes",
    providerId: "e2e-rooftop",
    title: "Rooftop Signal",
    artist: "The Queue",
    album: "Lobby Tapes",
    artworkUrl: "https://example.com/rooftop.jpg",
    previewUrl: "https://example.com/rooftop.m4a",
    durationMs: 30_000,
  },
  {
    provider: "itunes",
    providerId: "e2e-crown",
    title: "Crown Run",
    artist: "Final Score",
    album: "Reveal",
    artworkUrl: "https://example.com/crown.jpg",
    previewUrl: "https://example.com/crown.m4a",
    durationMs: 30_000,
  },
];

function uniqueName(prefix: string) {
  return `${prefix} ${Date.now()} ${Math.random().toString(16).slice(2, 8)}`;
}

async function post<T>(request: APIRequestContext, path: string, body?: unknown) {
  const response = await request.post(`${API_URL}${path}`, { data: body });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}

async function createParty(request: APIRequestContext, input: Partial<{ name: string; hostName: string; maxSongs: number; maxMinutes: number }> = {}) {
  return post<PartySnapshot>(request, "/api/parties", {
    name: input.name ?? uniqueName("E2E Party"),
    hostName: input.hostName ?? "Mia",
    maxSongs: input.maxSongs ?? 12,
    maxMinutes: input.maxMinutes ?? 45,
  });
}

async function joinParty(request: APIRequestContext, code: string, name = "Theo") {
  return post<PartySnapshot>(request, `/api/parties/${code}/join`, { name });
}

async function addTrack(request: APIRequestContext, party: PartySnapshot, track: Track, participantId = party.participants[0].id) {
  return post<PartySnapshot>(request, `/api/parties/${party.code}/queue`, { participantId, track });
}

async function vote(request: APIRequestContext, party: PartySnapshot, participantId: string, queueItemId: string) {
  return post<PartySnapshot>(request, `/api/parties/${party.code}/vote`, { participantId, queueItemId });
}

async function mockSearch(page: Page) {
  await page.route(`${API_URL}/api/music/search?**`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(tracks),
    });
  });
}

async function createPartyThroughUi(page: Page, customSongs = 23) {
  await page.goto("/");
  await page.getByRole("button", { name: /Start a party/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByLabel("Custom song limit").fill(String(customSongs));
  await page.locator(".np-choice.custom button").click();
  await page.getByRole("button", { name: /30-second battle/ }).click();
}

test.describe("host setup", () => {
  test("host can set a custom song limit and see it in the lobby", async ({ page }) => {
    await createPartyThroughUi(page, 23);

    await expect(page.locator(".np-lobby-title h2")).toContainText("ROOFTOP REVELS");
    await expect(page.locator(".np-lobby-queue > span b")).toHaveText("0/23");
  });

  test("preset upper bound creates a 50-song lobby limit", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Start a party/ }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByRole("button", { name: /∞/ }).click();
    await page.getByRole("button", { name: /Full songs/ }).click();

    await expect(page.locator(".np-lobby-queue > span b")).toHaveText("0/50");
  });

  test("joining an unknown room surfaces a useful error", async ({ page }) => {
    await page.goto("/?party=NOPE00");
    await page.getByRole("button", { name: "Join" }).click();

    await expect(page.locator(".np-error")).toContainText("Party not found");
  });
});

test.describe("lobby queue building", () => {
  test("people can open add-song search from the lobby before the party is live", async ({ page }) => {
    await createPartyThroughUi(page, 12);
    await page.getByRole("button", { name: /Add song/ }).click();

    await expect(page.locator(".np-modal h2")).toHaveText("Add a song");
    await expect(page.getByPlaceholder("Search a track to drop in the queue...")).toBeVisible();
  });

  test("mocked iTunes results can be added to the lobby queue", async ({ page }) => {
    await mockSearch(page);
    await createPartyThroughUi(page, 12);
    await page.getByRole("button", { name: /Add song/ }).click();
    await page.getByPlaceholder("Search a track to drop in the queue...").fill("neon");
    await page.getByRole("button", { name: "search" }).click();
    await page.getByRole("button", { name: /Neon Tilt/ }).click();

    await expect(page.locator(".np-lobby-queue")).toContainText("Neon Tilt");
    await expect(page.locator(".np-lobby-queue")).toContainText("Mia");
    await expect(page.locator(".np-lobby-queue > span b")).toHaveText("1/12");
  });

  test("copy invite writes the share URL and shows feedback", async ({ context, request, page }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const party = await createParty(request, { name: uniqueName("Copy Invite") });

    await page.goto(`/?party=${party.code}`);
    await page.getByRole("button", { name: "Join" }).click();
    await page.getByRole("button", { name: "Copy invite" }).click();

    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
    const origin = await page.evaluate(() => window.location.origin);
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}?party=${party.code}`);
  });

  test("share-link guests can join a lobby with the prefilled room code", async ({ request, page }) => {
    const party = await createParty(request, { name: uniqueName("Share Link") });

    await page.goto(`/?party=${party.code}`);
    await expect(page.getByPlaceholder("Room code")).toHaveValue(party.code);
    await page.getByPlaceholder("Your name").fill("Priya");
    await page.getByRole("button", { name: "Join" }).click();

    await expect(page.locator(".np-lobby-people")).toContainText("Priya");
  });

  test("host lobby updates in realtime when another browser joins", async ({ browser, request, page }) => {
    const party = await createParty(request, { name: uniqueName("Realtime Join") });

    await page.goto(`/?party=${party.code}`);
    await page.getByPlaceholder("Your name").fill("Theo");
    await page.getByRole("button", { name: "Join" }).click();
    await expect(page.locator(".np-lobby-people")).toContainText("Theo");
    await expect(page.locator(".np-lobby-people p")).toContainText("2");

    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(`/?party=${party.code}`);
    await guest.getByPlaceholder("Your name").fill("Priya");
    await guest.getByRole("button", { name: "Join" }).click();

    await expect(guest.locator(".np-lobby-people")).toContainText("Priya");
    await expect(page.locator(".np-lobby-people")).toContainText("Priya");
    await expect(page.locator(".np-lobby-people p")).toContainText("3");

    await guestContext.close();
  });
});

test.describe("queue and scoring edge cases", () => {
  test("the API rejects host song limits outside the supported 3-50 range", async ({ request }) => {
    const tooSmall = await request.post(`${API_URL}/api/parties`, {
      data: { name: "Tiny", hostName: "Mia", maxSongs: 2, maxMinutes: 45 },
    });
    const tooLarge = await request.post(`${API_URL}/api/parties`, {
      data: { name: "Huge", hostName: "Mia", maxSongs: 51, maxMinutes: 45 },
    });

    expect(tooSmall.status()).toBe(400);
    expect(await tooSmall.text()).toContain("Number must be greater than or equal to 3");
    expect(tooLarge.status()).toBe(400);
    expect(await tooLarge.text()).toContain("Number must be less than or equal to 50");
  });

  test("queue full errors once the host max song limit is reached", async ({ request }) => {
    let party = await createParty(request, { maxSongs: 3 });
    party = await addTrack(request, party, { ...tracks[0], providerId: uniqueName("full-a") });
    party = await addTrack(request, party, { ...tracks[1], providerId: uniqueName("full-b") });
    party = await addTrack(request, party, { ...tracks[2], providerId: uniqueName("full-c") });

    const response = await request.post(`${API_URL}/api/parties/${party.code}/queue`, {
      data: { participantId: party.participants[0].id, track: { ...tracks[0], providerId: uniqueName("full-d") } },
    });

    expect(response.status()).toBe(400);
    expect(await response.text()).toContain("Party queue is full");
  });

  test("votes increment and reorder queued songs before playback starts", async ({ request }) => {
    let party = await createParty(request);
    party = await addTrack(request, party, { ...tracks[0], providerId: uniqueName("vote-a") });
    party = await addTrack(request, party, { ...tracks[1], providerId: uniqueName("vote-b") });
    party = await joinParty(request, party.code, "Theo");
    const theo = party.participants.find((person) => person.name === "Theo")!;
    const rooftop = party.queue.find((item) => item.track.title === "Rooftop Signal")!;

    party = await vote(request, party, theo.id, rooftop.id);
    party = await vote(request, party, theo.id, rooftop.id);

    expect(party.queue[0].track.title).toBe("Rooftop Signal");
    expect(party.queue[0].votes).toBe(3);
  });

  test("starting a party moves the first queued song into now playing", async ({ request }) => {
    let party = await createParty(request);
    party = await addTrack(request, party, { ...tracks[0], providerId: uniqueName("start-a") });
    party = await addTrack(request, party, { ...tracks[1], providerId: uniqueName("start-b") });

    party = await post<PartySnapshot>(request, `/api/parties/${party.code}/start`);

    expect(party.status).toBe("LIVE");
    expect(party.currentItem?.track.title).toBe("Neon Tilt");
    expect(party.queue.map((item) => item.track.title)).toEqual(["Rooftop Signal"]);
  });

  test("skipping advances to the next queued song", async ({ request }) => {
    let party = await createParty(request);
    party = await addTrack(request, party, { ...tracks[0], providerId: uniqueName("skip-a") });
    party = await addTrack(request, party, { ...tracks[1], providerId: uniqueName("skip-b") });
    party = await post<PartySnapshot>(request, `/api/parties/${party.code}/start`);

    party = await post<PartySnapshot>(request, `/api/parties/${party.code}/advance`);

    expect(party.currentItem?.track.title).toBe("Rooftop Signal");
    expect(party.queue).toHaveLength(0);
  });

  test("jumping can play a queued song out of order", async ({ request }) => {
    let party = await createParty(request);
    party = await addTrack(request, party, { ...tracks[0], providerId: uniqueName("jump-a") });
    party = await addTrack(request, party, { ...tracks[1], providerId: uniqueName("jump-b") });
    party = await addTrack(request, party, { ...tracks[2], providerId: uniqueName("jump-c") });
    party = await post<PartySnapshot>(request, `/api/parties/${party.code}/start`);
    const crown = party.queue.find((item) => item.track.title === "Crown Run")!;

    party = await post<PartySnapshot>(request, `/api/parties/${party.code}/jump`, { queueItemId: crown.id });

    expect(party.currentItem?.track.title).toBe("Crown Run");
    expect(party.queue.map((item) => item.track.title)).toEqual(["Rooftop Signal"]);
  });

  test("cheers increment the current track and influence the crowned winner", async ({ request }) => {
    let party = await createParty(request);
    party = await addTrack(request, party, { ...tracks[0], providerId: uniqueName("win-a") });
    party = await addTrack(request, party, { ...tracks[1], providerId: uniqueName("win-b") });
    party = await joinParty(request, party.code, "Theo");
    const host = party.participants.find((person) => person.isHost)!;
    const theo = party.participants.find((person) => person.name === "Theo")!;

    party = await post<PartySnapshot>(request, `/api/parties/${party.code}/start`);
    await post<PartySnapshot>(request, `/api/parties/${party.code}/cheer`, { participantId: host.id });
    party = await post<PartySnapshot>(request, `/api/parties/${party.code}/cheer`, { participantId: theo.id });

    expect(party.currentItem?.cheers).toBe(2);

    party = await post<PartySnapshot>(request, `/api/parties/${party.code}/end`);

    expect(party.status).toBe("ENDED");
    expect(party.winner?.title).toBe("Neon Tilt");
    expect(party.winner?.cheers).toBe(2);
  });
});

test.describe("live room UI", () => {
  test("live page shows 3D now-playing album and waveform styles", async ({ request, page }) => {
    let party = await createParty(request);
    party = await addTrack(request, party, { ...tracks[0], providerId: uniqueName("visual-a") });
    party = await post<PartySnapshot>(request, `/api/parties/${party.code}/start`);

    await page.goto(`/?party=${party.code}`);
    await page.getByRole("button", { name: "Join" }).click();

    await expect(page.locator(".np-now h2")).toHaveText("Neon Tilt");
    await expect(page.locator(".np-bars")).toHaveClass(/playing/);

    const visualState = await page.evaluate(() => {
      const art = document.querySelector(".np-now-main > .np-art, .np-now-main > .np-album");
      const bars = document.querySelector(".np-bars");
      return {
        artTransform: art ? getComputedStyle(art).transform : "none",
        barsTransform: bars ? getComputedStyle(bars).transform : "none",
        artShadow: art ? getComputedStyle(art).boxShadow : "",
      };
    });

    expect(visualState.artTransform).toContain("matrix3d");
    expect(visualState.barsTransform).toContain("matrix3d");
    expect(visualState.artShadow).toContain("rgba");
  });
});
