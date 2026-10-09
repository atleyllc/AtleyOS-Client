/**
 * Phone setup, in the same order as the home server guide:
 * pair on home Wi‑Fi, confirm Away, then point the Immich and Nextcloud apps
 * at the right URLs.
 */

export type AwayCheck = "unknown" | "ready" | "down" | "missing";

export type SetupSnapshot = {
  paired: boolean;
  away: AwayCheck;
  awayAddress: string;
  photosUrl: string;
  filesUrl: string;
  learningDone: boolean;
};

export type SetupStepId = "pair" | "away" | "photos" | "files" | "learn";

export type SetupStep = {
  id: SetupStepId;
  title: string;
  body: string;
  done: boolean;
  primary: string;
};

export function awayHealthUrl(base: string | undefined | null): string {
  const trimmed = String(base || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return `${trimmed}/api/client/health`;
}

export function awayCheckMessage(input: { url: string; ok: boolean; error?: string }): string {
  if (!input.url) {
    return "Away isn’t saved on this phone yet. On the home dashboard, finish Away access. It is ready only when the tunnel is up. Then check again on this phone.";
  }
  if (input.ok) {
    return `Away ${input.url} answered. You can leave home Wi‑Fi and Chat still reaches home.`;
  }
  const why = input.error ? ` ${input.error}` : "";
  return `Away ${input.url} did not answer.${why} Away HTTPS is ready only when the tunnel is up. On the home dashboard, open Remote Access and confirm the tunnel, then check again.`;
}

export function phoneSetupSteps(snapshot: SetupSnapshot): SetupStep[] {
  const awayBody =
    snapshot.away === "ready"
      ? `Away ${snapshot.awayAddress} answered.`
      : snapshot.away === "down"
        ? `Away ${snapshot.awayAddress || "HTTPS"} did not answer. It is ready only when the tunnel is up.`
        : snapshot.away === "missing"
          ? "Away isn’t saved on this phone yet."
          : "Check that the Away address answers before you leave home Wi‑Fi.";

  const photosBody = snapshot.photosUrl
    ? `In the Immich app on this phone, set the server URL to ${snapshot.photosUrl}. Photo backup stays in Immich. AtleyOS does not upload your photo library itself.`
    : "Pair on home Wi‑Fi first so this phone can show the Photos URL.";

  const filesBody = snapshot.filesUrl
    ? `In the Nextcloud app on this phone, set the server URL to ${snapshot.filesUrl}.`
    : "Pair on home Wi‑Fi first so this phone can show the Files URL.";

  return [
    {
      id: "pair",
      title: "Pair on home Wi‑Fi",
      body: "On the home dashboard open Settings → Remote Access → Show pair QR. Scan it while this phone is on the same Wi‑Fi. The QR must carry the server’s LAN address, not 127.0.0.1.",
      done: snapshot.paired,
      primary: snapshot.paired ? "Paired" : "Scan the pair QR",
    },
    {
      id: "away",
      title: "Confirm Away",
      body: awayBody,
      done: snapshot.away === "ready",
      primary: "Check Away",
    },
    {
      id: "photos",
      title: "Photos app",
      body: photosBody,
      done: false,
      primary: snapshot.photosUrl ? "Copy Photos URL" : "Photos URL unavailable",
    },
    {
      id: "files",
      title: "Files app",
      body: filesBody,
      done: false,
      primary: snapshot.filesUrl ? "Copy Files URL" : "Files URL unavailable",
    },
    {
      id: "learn",
      title: "Learning",
      body: "Optional. Calendar, contacts, photo details, and place can stay on your home server. You can skip this and turn it on later in Settings.",
      done: snapshot.learningDone,
      primary: snapshot.learningDone ? "Learning is on" : "Allow learning",
    },
  ];
}
