import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { sendMessage } from "@/lib/telegram";
import {
  botDeepLink,
  generateLinkCode,
  getConnectedBot,
  LINK_CODE_TTL_MS,
} from "@/lib/telegram-server";
import User from "@/models/User";

// The signed-in user's own Telegram link, shown on their profile.

async function linkStatus(userId: string) {
  const [bot, user] = await Promise.all([
    getConnectedBot(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    User.findById(userId).select("telegram").lean() as Promise<any>,
  ]);
  const link = user?.telegram?.userId
    ? {
        username: user.telegram.username || null,
        firstName: user.telegram.firstName || null,
        linkedAt: user.telegram.linkedAt,
      }
    : null;
  return {
    available: !!bot,
    botUsername: bot?.botUsername ?? null,
    botUrl: bot ? botDeepLink(bot.botUsername) : null,
    link,
  };
}

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  return NextResponse.json(await linkStatus(authResult._id));
}

/** Issues a one-time t.me link that connects whoever opens it to this user. */
export async function POST(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const bot = await getConnectedBot();
  if (!bot) {
    return NextResponse.json(
      { error: "Telegram isn't set up yet. Ask an admin to connect a bot in Settings." },
      { status: 409 }
    );
  }

  const { code, hash } = generateLinkCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  await User.updateOne(
    { _id: authResult._id },
    { $set: { telegramLinkCodeHash: hash, telegramLinkCodeExpiresAt: expiresAt } }
  );

  return NextResponse.json({ url: botDeepLink(bot.botUsername, code), expiresAt }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const before: any = await User.findByIdAndUpdate(authResult._id, {
    $set: { telegram: null, telegramLinkCodeHash: null, telegramLinkCodeExpiresAt: null },
  })
    .select("telegram")
    .lean();

  // Let the Telegram side know, so the chat doesn't silently stop working.
  const bot = await getConnectedBot();
  if (bot && before?.telegram?.chatId) {
    await sendMessage(
      bot.token,
      before.telegram.chatId,
      "🔌 This Telegram account was disconnected from Magick Accounting. You can link it again from your profile."
    ).catch(() => undefined);
  }

  return NextResponse.json(await linkStatus(authResult._id));
}
