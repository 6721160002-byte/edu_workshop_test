"use strict";

// Firebase's REST API owns passwords and sends its hosted verification links.
// Tokens stay in server memory for the request; clients receive our existing
// HttpOnly session cookie only after Firebase confirms email ownership.
module.exports = function firebaseAuth({
  apiKey = process.env.FIREBASE_API_KEY,
  continueUrl = process.env.FIREBASE_CONTINUE_URL,
  request = global.fetch,
} = {}) {
  apiKey = String(apiKey || "").trim();
  if (continueUrl) {
    const url = new URL(continueUrl);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      throw new Error(
        "FIREBASE_CONTINUE_URL must use HTTPS (or localhost for development).",
      );
  }
  const failure = (status, message, code) =>
    Object.assign(new Error(message), { status, code });
  async function call(method, body) {
    if (!apiKey)
      throw failure(
        503,
        "ยังไม่ได้ตั้งค่าระบบยืนยันอีเมล กรุณาติดต่อผู้ดูแลระบบ",
        "FIREBASE_NOT_CONFIGURED",
      );
    let response, result;
    try {
      response = await request(
        `https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Firebase-Locale": "th",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        },
      );
      result = await response.json();
    } catch {
      throw failure(
        502,
        "เชื่อมต่อระบบยืนยันอีเมลไม่สำเร็จ กรุณาลองใหม่ภายหลัง",
        "FIREBASE_UNAVAILABLE",
      );
    }
    if (response.ok && !result.error) return result;
    const code = String(result.error?.message || "UNKNOWN").split(" : ")[0];
    if (code === "EMAIL_EXISTS")
      throw failure(409, "อีเมลนี้มีบัญชีแล้ว", code);
    if (
      [
        "INVALID_LOGIN_CREDENTIALS",
        "INVALID_PASSWORD",
        "EMAIL_NOT_FOUND",
        "USER_DISABLED",
        "INVALID_ID_TOKEN",
        "TOKEN_EXPIRED",
      ].includes(code)
    )
      throw failure(
        401,
        "อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือบัญชีไม่สามารถใช้งานได้",
        code,
      );
    if (
      ["TOO_MANY_ATTEMPTS_TRY_LATER", "QUOTA_EXCEEDED"].includes(code) ||
      response.status === 429
    )
      throw failure(
        429,
        "ส่งคำขอมากเกินไป กรุณารอแล้วลองใหม่ภายหลัง",
        "FIREBASE_RATE_LIMITED",
      );
    if (
      code.startsWith("WEAK_PASSWORD") ||
      code === "PASSWORD_DOES_NOT_MEET_REQUIREMENTS"
    )
      throw Object.assign(
        failure(400, "รหัสผ่านไม่ผ่านเงื่อนไขความปลอดภัย", code),
        { field: "password" },
      );
    if (
      [
        "OPERATION_NOT_ALLOWED",
        "CONFIGURATION_NOT_FOUND",
        "API_KEY_INVALID",
        "INVALID_API_KEY",
        "PROJECT_NOT_FOUND",
        "UNAUTHORIZED_DOMAIN",
        "INVALID_CONTINUE_URI",
      ].includes(code) ||
      response.status === 403
    )
      throw failure(
        503,
        "การตั้งค่าระบบยืนยันอีเมลยังไม่พร้อม กรุณาติดต่อผู้ดูแลระบบ",
        "FIREBASE_CONFIGURATION_ERROR",
      );
    throw failure(
      502,
      "ระบบยืนยันอีเมลไม่สามารถดำเนินการได้ กรุณาลองใหม่ภายหลัง",
      "FIREBASE_REQUEST_FAILED",
    );
  }
  async function identity(session) {
    if (!session.idToken || !session.localId)
      throw failure(
        502,
        "ระบบยืนยันอีเมลตอบกลับไม่สมบูรณ์",
        "FIREBASE_INVALID_RESPONSE",
      );
    const result = await call("lookup", { idToken: session.idToken });
    const user = result.users?.[0];
    if (
      !user ||
      user.localId !== session.localId ||
      user.disabled ||
      !user.email
    )
      throw failure(
        401,
        "ไม่สามารถตรวจสอบบัญชีได้ กรุณาเข้าสู่ระบบอีกครั้ง",
        "FIREBASE_INVALID_ACCOUNT",
      );
    return {
      uid: user.localId,
      email: user.email.toLowerCase(),
      verified: user.emailVerified === true,
      idToken: session.idToken,
    };
  }
  async function signIn(email, password) {
    return identity(
      await call("signInWithPassword", {
        email,
        password,
        returnSecureToken: true,
      }),
    );
  }
  return {
    available: Boolean(apiKey),
    signIn,
    async createOrSignIn(email, password) {
      try {
        return await identity(
          await call("signUp", { email, password, returnSecureToken: true }),
        );
      } catch (error) {
        if (error.code !== "EMAIL_EXISTS") throw error;
        return signIn(email, password);
      }
    },
    async sendVerification(idToken) {
      await call("sendOobCode", {
        requestType: "VERIFY_EMAIL",
        idToken,
        ...(continueUrl ? { continueUrl } : {}),
      });
    },
    async sendPasswordReset(email) {
      try {
        await call("sendOobCode", {
          requestType: "PASSWORD_RESET",
          email,
          ...(continueUrl ? { continueUrl } : {}),
        });
      } catch (error) {
        if (error.code !== "EMAIL_NOT_FOUND") throw error;
      }
    },
  };
};
