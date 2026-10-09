import { isLoopbackClientBase } from "./apiBases";

/** Shown when Chat has no paired session. */
export const UNPAIRED_MESSAGE =
  "This phone isn’t paired yet. Pair it with your home AtleyOS on home Wi‑Fi.";

export class NotPairedError extends Error {
  constructor(message = UNPAIRED_MESSAGE) {
    super(message);
    this.name = "NotPairedError";
  }
}

export type BaseMode = "https" | "lan" | "overlay" | "unknown";

const MODE_LABEL: Record<BaseMode, string> = {
  https: "Away",
  lan: "LAN",
  overlay: "Home VPN",
  unknown: "Home",
};

function modeOf(
  base: string,
  input: { https: string; lan: string; overlay: string },
): BaseMode {
  if (input.https && base === input.https) return "https";
  if (input.lan && base === input.lan) return "lan";
  if (input.overlay && base === input.overlay) return "overlay";
  return "unknown";
}

function checkFor(mode: BaseMode): string {
  switch (mode) {
    case "https":
      return "On the home dashboard, open Remote Access and confirm the tunnel is up. Away HTTPS is ready only when that tunnel is up.";
    case "lan":
      return "Confirm AtleyOS is running and this phone is on the same Wi‑Fi as the server.";
    case "overlay":
      return "Home VPN is optional. Use it only when you want the whole phone on the home network.";
    default:
      return "Confirm AtleyOS is running at home.";
  }
}

export type UnreachableExplanation = {
  message: string;
  /** Saved address is loopback or missing — Owner should open the pair screen. */
  suggestPair: boolean;
};

/**
 * Paired, but no candidate answered. Names each address that was tried
 * (Away vs LAN vs Home VPN) and what to check.
 */
export function explainUnreachable(input: {
  onWifi: boolean;
  allowLoopback: boolean;
  https: string;
  lan: string;
  overlay: string;
  tried: string[];
  httpsReady?: boolean;
}): UnreachableExplanation {
  const skipped: string[] = [];
  if (!input.allowLoopback) {
    const saved: Array<[BaseMode, string]> = [
      ["https", input.https],
      ["lan", input.lan],
      ["overlay", input.overlay],
    ];
    for (const [mode, base] of saved) {
      if (base && isLoopbackClientBase(base) && !input.tried.includes(base)) {
        skipped.push(
          `${MODE_LABEL[mode]} ${base} points at this phone, so it was skipped.`,
        );
      }
    }
  }

  const tunnelDown =
    Boolean(input.https) &&
    input.httpsReady === false &&
    !input.tried.includes(input.https);

  if (input.tried.length === 0) {
    if (tunnelDown) {
      return {
        message:
          `Couldn’t reach home.\n` +
          `Away ${input.https} — the home server says the tunnel is not up. Away HTTPS is ready only when that tunnel is up.`,
        suggestPair: false,
      };
    }
    if (!input.onWifi && !input.https) {
      return {
        message:
          "Away HTTPS isn’t saved on this phone yet. On home Wi‑Fi, finish Away access on the dashboard (it is ready only when the tunnel is up), then open Chat once or re-pair.",
        suggestPair: true,
      };
    }
    if (skipped.length) {
      return {
        message:
          `Couldn’t reach home.\n${skipped.join("\n")}\n` +
          "On home Wi‑Fi, re-pair: dashboard → Remote Access → Show pair QR. The phone needs the server’s LAN address.",
        suggestPair: true,
      };
    }
    return {
      message:
        "Couldn’t reach home.\nNo home address is saved on this phone. On home Wi‑Fi, re-pair: dashboard → Remote Access → Show pair QR.",
      suggestPair: true,
    };
  }

  const lines = ["Couldn’t reach home."];
  for (const base of input.tried) {
    const mode = modeOf(base, input);
    lines.push(`${MODE_LABEL[mode]} ${base} — ${checkFor(mode)}`);
  }
  if (tunnelDown) {
    lines.push(
      `Away ${input.https} — the home server says the tunnel is not up, so it was not used.`,
    );
  }
  if (skipped.length) lines.push(...skipped);
  const onlyLoopback =
    input.tried.length > 0 && input.tried.every((base) => isLoopbackClientBase(base));
  return {
    message: lines.join("\n"),
    suggestPair: onlyLoopback || (skipped.length > 0 && input.tried.length === 0),
  };
}
