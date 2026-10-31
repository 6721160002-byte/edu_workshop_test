"use strict";

module.exports = function emailDelivery(options = {}) {
  const unavailable = () => ({
    available: false,
    async send() {
      throw new Error("EMAIL_NOT_CONFIGURED");
    },
  });
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  if (smtpUser && smtpPassword) {
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = Number(process.env.SMTP_PORT || 465);
    if (![465, 587, 2525].includes(port)) return unavailable();
    const from = process.env.SMTP_FROM || `BSRU Workshop <${smtpUser}>`;
    const transport = (
      options.createTransport || require("nodemailer").createTransport
    )({
      host,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: {
        user: smtpUser,
        pass:
          host === "smtp.gmail.com"
            ? smtpPassword.replace(/\s/g, "")
            : smtpPassword,
      },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      dnsTimeout: 10000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    return {
      available: true,
      async send(to, code, { purpose = "registration" } = {}) {
        const reset = purpose === "reset";
        try {
          const result = await transport.sendMail({
            from,
            to,
            subject: reset
              ? "รหัส OTP สำหรับรีเซ็ตรหัสผ่าน BSRU Workshop"
              : "ยืนยันอีเมล BSRU Workshop",
            text: `${reset ? "รหัส OTP สำหรับรีเซ็ตรหัสผ่าน" : "รหัสยืนยันอีเมล"}ของคุณคือ ${code}\nรหัสมีอายุ 5 นาที ใช้ได้ครั้งเดียว อย่าเปิดเผยรหัสนี้แก่ผู้อื่น\nหากไม่ได้เป็นผู้ขอรหัส สามารถละเว้นอีเมลนี้ได้`,
          });
          if (
            !result.accepted?.some(
              (address) => String(address).toLowerCase() === to.toLowerCase(),
            )
          )
            throw new Error("SMTP_REJECTED");
        } catch {
          throw new Error("EMAIL_SEND_FAILED");
        }
      },
    };
  }
  if (options.allowResend === false) return unavailable();
  const key = process.env.RESEND_API_KEY;
  const from = process.env.OTP_FROM;
  return {
    available: Boolean(key && from),
    async send(to, code, { purpose = "registration" } = {}) {
      if (!key || !from) throw new Error("EMAIL_NOT_CONFIGURED");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject:
            purpose === "reset"
              ? "รหัส OTP สำหรับรีเซ็ตรหัสผ่าน BSRU Workshop"
              : "ยืนยันอีเมล BSRU Workshop",
          text: `${purpose === "reset" ? "รหัส OTP สำหรับรีเซ็ตรหัสผ่าน" : "รหัสยืนยันอีเมล"}ของคุณคือ ${code}\nรหัสมีอายุ 5 นาที ใช้ได้ครั้งเดียว อย่าเปิดเผยรหัสนี้แก่ผู้อื่น`,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok || !result.id) throw new Error("EMAIL_SEND_FAILED");
    },
  };
};
