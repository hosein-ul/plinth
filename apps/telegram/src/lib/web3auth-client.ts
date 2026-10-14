/**
 * Browser side of Web3Auth sign-in. The SDK is large, so it is imported only when someone clicks the button.
 * The identity token it returns is verified on the server; nothing it says is trusted here.
 */
export const WEB3AUTH_CLIENT_ID = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ?? "";
/** Must match the environment the project was created in on the Web3Auth dashboard. */
const NETWORK = process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK === "sapphire_mainnet" ? "sapphire_mainnet" : "sapphire_devnet";

/** Thrown when the person closes the dialog or declines in their wallet. Everything else is a real failure and keeps its own message. */
export class SignInCancelled extends Error {
  constructor() { super("Sign-in was cancelled"); }
}

const declined = (e: unknown) => /user (closed|rejected|denied|cancel)|rejected the request|request rejected|denied (message|transaction) signature|modal (is )?closed/i.test(e instanceof Error ? e.message : String(e));

export async function getWeb3AuthIdToken(): Promise<string> {
  const { Web3Auth } = await import("@web3auth/modal");
  const w3a = new Web3Auth({ clientId: WEB3AUTH_CLIENT_ID, web3AuthNetwork: NETWORK });
  try {
    await w3a.init();
    const connection = await w3a.connect();
    // connect() can resolve with nothing for some wallets even though the session is open, so ask the SDK itself.
    if (!connection && !w3a.connected) throw new SignInCancelled();
    const { idToken } = await w3a.getAuthTokenInfo();
    if (!idToken) throw new Error("Web3Auth did not return an identity token");
    return idToken;
  } catch (err) {
    if (err instanceof SignInCancelled) throw err;
    console.error("[web3auth] sign-in failed", err);
    if (declined(err)) throw new SignInCancelled();
    throw err;
  } finally {
    // The server session replaces the Web3Auth one; do not leave a second login behind in the browser.
    await w3a.logout().catch(() => undefined);
  }
}
