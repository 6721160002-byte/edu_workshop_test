"use strict";
/* Original BSRU Workshop interface, connected to the local Node.js API. */
(() => {
  let apiCsrf = null,
    apiSaving = Promise.resolve(),
    apiSaveCount = 0,
    apiSaveEpoch = 0,
    apiPollTimer = null;
  let otpAvailable = false,
    registrationAvailable = false,
    registrationProvider = "password",
    passwordResetAvailable = false;
  let syncMessage = "กำลังเชื่อมต่อ…";
  function updateSync(message) {
    syncMessage = message;
    document.querySelectorAll("[data-sync-status]").forEach((el) => {
      el.textContent = message;
    });
  }
  async function apiRequest(endpoint, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined && !headers.has("Content-Type"))
      headers.set("Content-Type", "application/json");
    if (apiCsrf && options.method && options.method !== "GET")
      headers.set("X-CSRF-Token", apiCsrf);
    const response = await fetch(endpoint, {
      ...options,
      headers,
      credentials: "same-origin",
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {}
    if (!response.ok)
      throw Object.assign(
        new Error(payload.error || "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ"),
        {
          status: response.status,
          field: payload.field,
          code: payload.code,
          registration: payload.registration,
        },
      );
    return payload;
  }
  function startApiPolling() {
    if (apiPollTimer) return;
    apiPollTimer = setInterval(async () => {
      if (
        !apiCsrf ||
        apiSaveCount ||
        document.activeElement?.matches?.("input, textarea, select") ||
        document.querySelector("#modal-root .dialog") ||
        document.querySelector("#workshop-actions-menu")
      )
        return;
      try {
        const actor = state.userId;
        const latest = await apiRequest("/api/store");
        updateSync(
          "อัปเดตล่าสุด " +
            new Date().toLocaleTimeString("th-TH", {
              hour: "2-digit",
              minute: "2-digit",
            }),
        );
        if (state.userId !== actor || !apiCsrf) return;
        if (latest.store.revision > store.revision) {
          const source = store.workshops.map((w) => ({ ...w }));
          Object.assign(store, latest.store);
          window.__demoWorkshopSource = source;
          overlayDemoImages();
          render();
        }
      } catch (error) {
        if (error.status === 401) {
          apiCsrf = null;
          state.userId = null;
          render();
          toast("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
        } else updateSync("เชื่อมต่อขัดข้อง · กำลังลองใหม่");
      }
    }, 5000);
  }
  function overlayDemoImages() {
    for (const w of store.workshops) {
      const original = window.__demoWorkshopSource?.find((x) => x.id === w.id);
      if (original) {
        if (!w.cover) w.cover = original.cover;
        if (!w.icon) w.icon = original.icon;
        if (!w.category) w.category = original.category;
        if (!w.photoSource) w.photoSource = original.photoSource;
      }
    }
  }
  const $ = (s) => document.querySelector(s),
    esc = (v) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const randomBytes = (n) => {
    const b = new Uint8Array(n);
    if (globalThis.crypto?.getRandomValues)
      return globalThis.crypto.getRandomValues(b);
    for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
    return b;
  };
  const uid = () =>
    globalThis.crypto?.randomUUID?.() ||
    Date.now().toString(36) +
      Array.from(randomBytes(16), (b) => b.toString(16).padStart(2, "0")).join(
        "",
      );
  const LOGO = "/assets/images/bsru-workshop-logo.png";
  const PHOTOS = {
    team: "/assets/images/image-002.jpg",
    code: "/assets/images/image-003.jpg",
    camera: "/assets/images/image-004.jpg",
    design: "/assets/images/image-005.jpg",
  };
  const PROGRAMS = {
    คณะครุศาสตร์: [
      "การวัดประเมินและวิจัยทางการศึกษา (ค.บ.)",
      "จิตวิทยาและการแนะแนว (ค.บ.)",
      "เทคโนโลยีดิจิทัลเพื่อการศึกษา (ค.บ.)",
      "การประถมศึกษา (ค.บ.)",
      "การศึกษาปฐมวัย (ค.บ.)",
      "วิทยาศาสตร์ทั่วไป (ค.บ.)",
      "เคมี (ค.บ.)",
      "ฟิสิกส์ (ค.บ.)",
      "ศิลปศึกษา (ค.บ.)",
      "พลศึกษา (ค.บ.)",
      "นาฏยศิลป์ศึกษา (ค.บ.)",
      "ภาษาไทย (ค.บ.)",
      "ภาษาอังกฤษ (ค.บ.)",
      "สังคมศึกษา (ค.บ.)",
      "คณิตศาสตร์ (ค.บ.)",
      "คอมพิวเตอร์ศึกษา (ค.บ.)",
      "ชีววิทยา (ค.บ.)",
      "การออกกำลังกายและกีฬา (ค.บ.)",
    ],
    คณะมนุษยศาสตร์และสังคมศาสตร์: [
      "นิติศาสตร์ (น.บ.)",
      "รัฐประศาสนศาสตร์ (รป.บ.)",
      "นาฏยศาสตร์สร้างสรรค์และการจัดการวัฒนธรรมการแสดง (ศป.บ.)",
      "ครีเอทีฟกราฟิก (ศป.บ.)",
      "ภาษาจีน (ศศ.บ.)",
      "ภาษาไทย (ศศ.บ.)",
      "ภาษาและวัฒนธรรมเอเชียตะวันออก (ศศ.บ.)",
      "ภาษาอังกฤษ (ศศ.บ.)",
      "สังคมศาสตร์เพื่อการพัฒนา (ศศ.บ.)",
      "บรรณารักษศาสตร์และสารสนเทศศาสตร์ (ศศ.บ.)",
      "อาเซียนศึกษา (ศศ.บ.)",
    ],
    คณะวิทยาการจัดการ: [
      "การบัญชี (บช.บ.)",
      "การจัดการโลจิสติกส์และโซ่อุปทาน (บธ.บ.)",
      "การตลาดดิจิทัลเชิงสร้างสรรค์ (บธ.บ.)",
      "การจัดการธุรกิจและทรัพยากรมนุษย์ (บธ.บ.)",
      "การเป็นผู้ประกอบการ (บธ.บ.)",
      "ธุรกิจดิจิทัล (บธ.บ.)",
      "การจัดการธุรกิจระหว่างประเทศ (หลักสูตรนานาชาติ) (บธ.บ.)",
      "นวัตกรรมทางเศรษฐกิจ การเงินและการลงทุน (ศ.บ.)",
      "นวัตกรรมการท่องเที่ยว (ศศ.บ.)",
      "การสื่อสารการตลาดและธุรกิจบันเทิง (นศ.บ.)",
      "การสื่อสารดิจิทัลคอนเทนต์ (นศ.บ.)",
      "บรอดคาสติงและสื่อสตรีมมิง (นศ.บ.)",
      "ภาพยนตร์ (นศ.บ.)",
    ],
    คณะวิทยาศาสตร์และเทคโนโลยี: [
      "เทคโนโลยีการเกษตร (วท.บ.)",
      "คณิตศาสตร์ (วท.บ.)",
      "เคมีผลิตภัณฑ์ (วท.บ.)",
      "นวัตกรรมและเทคโนโลยีพอลิเมอร์ (วท.บ.)",
      "เทคโนโลยีสารสนเทศและวิทยาการข้อมูล (วท.บ.)",
      "เทคโนโลยีสุขภาพ (วท.บ.)",
      "คอมพิวเตอร์อิเล็กทรอนิกส์ (วท.บ.)",
      "วิทยาการคอมพิวเตอร์ (วท.บ.)",
      "การจัดการทรัพยากรธรรมชาติและสิ่งแวดล้อม (วท.บ.)",
      "อาชีวอนามัยและความปลอดภัย (วท.บ.)",
      "แอนิเมชัน เกม และดิจิทัลมีเดีย (วท.บ.)",
      "วิทยาการธุรกิจสุขภาพและความงาม (วท.บ.)",
      "สมุนไพรและกัญชาศาสตร์ (วท.บ.)",
      "วิทยาศาสตร์เครื่องสำอาง (วท.บ.)",
      "การประกอบและบริการอาหาร (วท.บ.)",
    ],
    คณะสหเวชศาสตร์: [
      "การแพทย์แผนไทย (พท.บ.)",
      "สาธารณสุขศาสตร์ (ส.บ.)",
      "วิทยาศาสตร์การแพทย์ (วท.บ.)",
      "ชีววิทยาการแพทย์ (วท.บ.)",
      "เทคนิคการแพทย์ (วท.บ.)",
      "เทคโนโลยีการอาหาร (วท.บ.)",
    ],
    คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม: [
      "การจัดการวิศวกรรมการผลิตและโลจิสติกส์ (การจัดการผลิตและคุณภาพ) (อส.บ.)",
      "การจัดการวิศวกรรมการผลิตและโลจิสติกส์ (การจัดการคลังสินค้า) (อส.บ.)",
      "การจัดการวิศวกรรมการผลิตและโลจิสติกส์ (การจัดการดิจิทัลโลจิสติกส์) (อส.บ.)",
      "วิศวกรรมยานยนต์ไฟฟ้า (วศ.บ.)",
      "วิศวกรรมอุตสาหการและการจัดการโซ่อุปทาน (วศ.บ.)",
      "วิศวกรรมพลังงาน (วศ.บ.)",
      "วิศวกรรมไฟฟ้าและระบบควบคุมอัตโนมัติ (วศ.บ.)",
      "เทคโนโลยีโลจิสติกส์ (วท.บ.)",
      "ออกแบบผลิตภัณฑ์และนวัตกรรม",
      "เทคโนโลยีการจัดการอุตสาหกรรม (ต่อเนื่อง) (ทล.บ.)",
    ],
    วิทยาลัยการดนตรี: [
      "เทคโนโลยีและนวัตกรรมการผลิตดนตรี (ทล.บ.)",
      "ดนตรีตะวันตก (ดศ.บ.)",
      "ดนตรีไทย (ดศ.บ.)",
      "ดนตรีตะวันตก (หลักสูตรนานาชาติ) (ดศ.บ.)",
      "ดนตรีตะวันตกศึกษา (ค.บ.)",
      "ดนตรีไทยศึกษา (ค.บ.)",
    ],
    คณะพยาบาลศาสตร์: ["พยาบาลศาสตร์ (พย.บ.)"],
    คณะครุศาสตร์และบัณฑิตวิทยาลัย: ["จิตวิทยาการปรึกษามหาบัณฑิต"],
  };
  // Source: https://course.bsru.ac.th/admission/ (81 programs, checked 27 Oct 2026); nursing: https://ns.bsru.ac.th/?page_id=692
  const issues = [
    "อีเมลกับรหัสไม่ตรงกัน เข้าสู่ระบบไม่ได้",
    "จำนวนชั่วโมงอบรมไม่ถูกต้อง",
    "ยกเลิกอบรมไม่ได้",
    "เข้าอบรมแล้ว แต่ไปขึ้นที่สถานะว่าไม่ได้เข้าร่วม",
    "ไม่ได้เข้าร่วมงาน แต่ขึ้นว่าเข้าร่วมงาน",
    "ข้อมูลส่วนตัวที่กรอกตอนสมัครเข้าสู่ระบบไม่ตรงกับข้อมูลที่เจ้าหน้าที่ส่งมา",
    "แดชบอร์ดเข้าร่วมงานกับข้อมูลเข้าร่วมงานไม่ตรงกัน",
    "เลือกรอบเวลาหรือกลุ่มเวิร์กช็อปไม่ได้ / แสดงรอบไม่ตรง",
    "ข้อมูลสถานที่ / ห้องจัดเวิร์กช็อปในแอปไม่ถูกต้อง หรือแผนที่คลาดเคลื่อน",
    "ลงทะเบียนเวิร์กช็อปไม่ได้",
  ];
  const labels = {
    PENDING: "รอดำเนินการ",
    ATTENDED: "เข้าร่วมงานแล้ว",
    ABSENT: "ไม่ได้เข้าร่วม",
    CANCELLED: "ยกเลิกการลงทะเบียน",
    APPROVED: "อนุมัติแล้ว",
    WAITING: "รอเจ้าหน้าที่อนุมัติ",
  };
  const dateOffset = (days, hour) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  const store = {
    users: [
      {
        id: "student",
        name: "นักศึกษาตัวอย่าง",
        type: "นักศึกษา",
        code: "STD-DEMO",
        email: "std_demo@bsru.ac.th",
        phone: "0812345678",
        faculty: "คณะวิทยาศาสตร์และเทคโนโลยี",
        major: "วิทยาการคอมพิวเตอร์ (วท.บ.)",
        status: "APPROVED",
        role: "user",
      },
      {
        id: "teacher",
        name: "อาจารย์ตัวอย่าง",
        type: "อาจารย์",
        code: "TCH-DEMO",
        email: "staff_demo@bsru.ac.th",
        phone: "0899990002",
        faculty: "คณะครุศาสตร์",
        major: "คอมพิวเตอร์ศึกษา (ค.บ.)",
        status: "APPROVED",
        role: "user",
      },
      {
        id: "admin",
        name: "ผู้ดูแลระบบ BSRU",
        type: "เจ้าหน้าที่",
        code: "ADMIN-01",
        email: "admin1@bsru.ac.th",
        phone: "0899990001",
        faculty: "สำนักคอมพิวเตอร์",
        major: "งานบริหารระบบ",
        status: "APPROVED",
        role: "staff",
      },
    ],
    workshops: [
      {
        id: "w1",
        title: "ปลดล็อกไอเดีย สร้างสรรค์งานด้วย Generative AI",
        start: dateOffset(3, 9),
        end: dateOffset(3, 16),
        place: "ห้องปฏิบัติการคอมพิวเตอร์ อาคาร 28",
        capacity: 40,
        hours: 6,
        cover: "",
        icon: "fa-wand-magic-sparkles",
        category: "AI & INNOVATION",
        description:
          "เรียนรู้เครื่องมือ AI และฝึกออกแบบผลงานจริง เปิดพื้นที่ให้ทุกไอเดียเป็นไปได้",
      },
      {
        id: "w2",
        title: "ออกแบบสื่อให้น่าสนใจด้วย Canva",
        start: dateOffset(7, 9),
        end: dateOffset(7, 12),
        place: "ศูนย์การเรียนรู้ ชั้น 3",
        capacity: 30,
        hours: 3,
        cover: "",
        icon: "fa-palette",
        category: "CREATIVE DESIGN",
        description: "เปลี่ยนเรื่องราวเป็นงานออกแบบที่สื่อสารได้อย่างมืออาชีพ",
      },
      {
        id: "w3",
        title: "เริ่มต้นวิเคราะห์ข้อมูลด้วย Excel",
        start: dateOffset(10, 13),
        end: dateOffset(10, 16),
        place: "ห้องคอมพิวเตอร์ 2831",
        capacity: 35,
        hours: 3,
        cover: "",
        icon: "fa-chart-column",
        category: "DIGITAL SKILLS",
        description: "จัดการข้อมูล สร้างสูตร และต่อยอดทักษะการทำงานยุคดิจิทัล",
      },
    ],
    registrations: [],
    complaints: [],
    ratings: [],
    notifications: [],
    revision: 0,
  };
  // Sample history belongs only to demo users, never to the administrator.
  store.workshops.push(
    {
      id: "w4",
      title: "ทักษะการนำเสนอและสื่อสารอย่างมั่นใจ",
      start: dateOffset(-7, 9),
      end: dateOffset(-7, 14),
      hours: 4,
      place: "ห้องประชุม อาคาร 27",
      capacity: 50,
      cover: "",
      icon: "fa-microphone",
      category: "COMMUNICATION",
      description: "ฝึกนำเสนอแนวคิดและสื่อสารอย่างมีประสิทธิภาพ",
    },
    {
      id: "w5",
      title: "พื้นฐานการถ่ายภาพด้วยสมาร์ตโฟน",
      start: dateOffset(-14, 9),
      end: dateOffset(-14, 12),
      hours: 3,
      place: "ศูนย์การเรียนรู้ ชั้น 2",
      capacity: 30,
      cover: "",
      icon: "fa-camera",
      category: "CREATIVE SKILLS",
      description: "เรียนรู้แสง มุมภาพ และการเล่าเรื่องผ่านภาพถ่าย",
    },
  );
  const photoSources = {
    code: {
      url: "https://unsplash.com/photos/QUHuwyNgSA0",
      credit: "Karl Pawlowicz / Unsplash",
    },
    design: {
      url: "https://unsplash.com/photos/fJdEMpA83NM",
      credit: "Ryan Spaulding / Unsplash",
    },
    team: {
      url: "https://unsplash.com/photos/vdXMSiX-n6M",
      credit: "Mimi Thian / Unsplash",
    },
    camera: {
      url: "https://unsplash.com/photos/u67GBtLNt2k",
      credit: "Cemrecan Yurtman / Unsplash",
    },
  };
  for (const [id, key] of [
    ["w1", "code"],
    ["w2", "design"],
    ["w3", "code"],
    ["w4", "team"],
    ["w5", "camera"],
  ]) {
    const w = store.workshops.find((w) => w.id === id);
    w.cover = PHOTOS[key];
    w.photoSource = photoSources[key];
  }
  for (const [id, userId, workshopId, status, days] of [
    ["demo-r1", "student", "w1", "PENDING", 0],
    ["demo-r2", "student", "w4", "ATTENDED", -7],
    ["demo-r3", "student", "w5", "ABSENT", -14],
    ["demo-r4", "student", "w2", "CANCELLED", -1],
    ["demo-r5", "teacher", "w4", "ATTENDED", -7],
  ])
    store.registrations.push({
      id,
      userId,
      workshopId,
      status,
      createdAt: dateOffset(days, 8),
      updatedAt: dateOffset(days, 15),
      ratingEvent: uid(),
    });
  let state = {
      portal: "user",
      userId: null,
      page: "dashboard",
      view: "open",
      search: "",
      filter: "all",
      dashboardMonths: 6,
      dashboardAgendaOpen: false,
      slide: 0,
      notificationFilter: "general",
      notificationQuery: "",
      promoSlide: 0,
      approvalQuery: "",
      approvalStatus: "WAITING",
      participantQuery: "",
      participantStatus: "all",
      managePage: 1,
      manageView: "current",
      managePageSize: 10,
      manageSort: "priority",
      archiveYear: null,
      archiveMonth: "all",
      archiveQuery: "",
      archivePage: 1,
      archiveWorkshop: null,
      archiveParticipantQuery: "",
      archiveParticipantStatus: "all",
      archiveParticipantPage: 1,
    },
    ready = false,
    initializing = false,
    bootstrapError = false,
    bootstrapStage = "session",
    modalReturn = null,
    toastTimer;
  let workshopMenuTrigger = null;
  const user = () => store.users.find((u) => u.id === state.userId);
  const staff = () => state.portal === "staff" && user()?.role === "staff";
  const member = () =>
    state.portal === "user" &&
    user()?.role === "user" &&
    user()?.status === "APPROVED";
  const badge = (s) =>
    `<span class="badge ${esc(s)}">${esc(labels[s] || s)}</span>`;
  const fmt = (s) =>
    new Date(s).toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  const occupancy = (id) =>
    !staff() &&
    Number.isFinite(store.workshops.find((w) => w.id === id)?.occupancy)
      ? store.workshops.find((w) => w.id === id).occupancy
      : store.registrations.filter(
          (r) => r.workshopId === id && r.status !== "CANCELLED",
        ).length;
  const scheduledPhase = (w) =>
    Date.now() < +new Date(w.start)
      ? "upcoming"
      : Date.now() <= +new Date(w.end)
        ? "ongoing"
        : "finished";
  const phase = (w) =>
    w.cancelled ? "cancelled" : w.closed ? "closed" : scheduledPhase(w);
  const phaseLabel = (w) =>
    ({
      upcoming: "เร็วๆ นี้",
      ongoing: "ดำเนินการอยู่",
      finished: "เสร็จสิ้นแล้ว",
      closed: "ปิดรับสมัคร",
      cancelled: "ยกเลิกกิจกรรม",
    })[phase(w)];
  function toast(msg) {
    clearTimeout(toastTimer);
    $("#toast-root").innerHTML = `<div class="toast">${esc(msg)}</div>`;
    toastTimer = setTimeout(() => ($("#toast-root").innerHTML = ""), 4000);
  }
  function commit(msg) {
    store.revision++;
    render();
    if (apiCsrf && state.userId) {
      updateSync("กำลังบันทึก…");
      apiSaveCount++;
      const epoch = apiSaveEpoch,
        actor = state.userId;
      const snapshot = JSON.parse(JSON.stringify(store));
      apiSaving = apiSaving
        .then(() =>
          epoch === apiSaveEpoch && actor === state.userId
            ? apiRequest("/api/store", {
                method: "POST",
                body: JSON.stringify({ store: snapshot }),
              })
            : null,
        )
        .then((result) => {
          if (result && epoch === apiSaveEpoch && actor === state.userId) {
            store.revision = Math.max(store.revision, result.revision);
            if (apiSaveCount === 1) {
              Object.assign(store, result.store);
              overlayDemoImages();
              render();
            }
            updateSync(
              "บันทึกแล้ว " +
                new Date().toLocaleTimeString("th-TH", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
            );
            if (msg) toast(msg);
          }
        })
        .catch(async (error) => {
          if (actor !== state.userId || epoch !== apiSaveEpoch) return;
          apiSaveEpoch++;
          updateSync("บันทึกไม่สำเร็จ · กำลังโหลดข้อมูลล่าสุด");
          toast(error.message);
          try {
            const latest = await apiRequest("/api/store");
            if (actor !== state.userId) return;
            Object.assign(store, latest.store);
            overlayDemoImages();
            render();
          } catch {
            updateSync("เชื่อมต่อขัดข้อง · โปรดตรวจสอบก่อนทำรายการต่อ");
          }
        })
        .finally(() => {
          apiSaveCount--;
          if (
            epoch === apiSaveEpoch &&
            actor === state.userId &&
            state.page === "participants"
          )
            render();
        });
    }
    return apiSaving;
  }
  const otpChallenges = new Map(),
    resetGrants = new Map();
  const localDemo = ["localhost", "127.0.0.1", "[::1]"].includes(
    window.location?.hostname,
  );
  let currentChallenge = null;
  const passwordPolicy =
    "อย่างน้อย 12 ตัวอักษร มี A–Z, a–z, ตัวเลข และสัญลักษณ์ ไม่มีช่องว่าง";
  function passwordError(p, confirmation) {
    if (
      p.length < 12 ||
      p.length > 128 ||
      !/^[^\s]+$/.test(p) ||
      !/[A-Z]/.test(p) ||
      !/[a-z]/.test(p) ||
      !/[0-9]/.test(p) ||
      !/[^A-Za-z0-9]/.test(p)
    )
      return passwordPolicy;
    if (
      [
        "password123!",
        "password1234!",
        "qwerty123456!",
        "123456789abc!",
      ].includes(p.toLowerCase())
    )
      return "รหัสผ่านนี้เดาง่าย กรุณาใช้รหัสผ่านอื่น";
    if (p !== confirmation) return "รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน";
    return "";
  }
  const hoursOf = (r) =>
    r.status === "ATTENDED"
      ? store.workshops.find((w) => w.id === r.workshopId)?.hours || 0
      : 0;
  const number = (n) =>
    Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 });
  function workshopMeta(w) {
    return `<div class="meta"><span><i class="fa-regular fa-calendar"></i>เริ่ม ${esc(fmt(w.start))}</span><span><i class="fa-regular fa-clock"></i>สิ้นสุด ${esc(fmt(w.end))}</span><span><i class="fa-solid fa-location-dot"></i>${esc(w.place)}</span><span><i class="fa-solid fa-users"></i>เหลือ ${Math.max(0, w.capacity - occupancy(w.id))} จาก ${w.capacity} ที่นั่ง</span><span><i class="fa-solid fa-hourglass-half"></i>จำนวนชั่วโมงอบรม <b>${number(w.hours)} ชั่วโมง</b></span></div>`;
  }

  const input = (label, name, type = "text", extra = "") =>
    `<div class="field"><label for="${name}">${label}</label>${type === "password" ? '<div class="password-wrap">' : ""}<input id="${name}" name="${name}" type="${type}" ${extra} required>${type === "password" ? `<button type="button" class="password-toggle" data-action="toggle-password" data-id="${name}" aria-controls="${name}" aria-pressed="false" aria-label="แสดงรหัสผ่าน"><i class="fa-regular fa-eye"></i><span>แสดง</span></button></div>` : ""}</div>`;
  function accountMenu(u) {
    const item = (action, icon, label, extra = "") =>
      `<button type="button" data-action="${action}" ${extra}><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${label}</span></button>`;
    return `<div class="account-menu">
      <button type="button" class="account-menu-trigger" data-action="toggle-account-menu" aria-expanded="false" aria-controls="account-dropdown" aria-label="เมนูบัญชี ${esc(u.name)}"><span class="header-avatar" aria-hidden="true">${esc(Array.from(u.name)[0] || "ผ")}</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>
      <nav id="account-dropdown" class="account-dropdown" aria-label="บัญชีผู้ใช้งาน" hidden>
        <div class="account-dropdown-heading"><span class="profile-avatar" aria-hidden="true">${esc(Array.from(u.name)[0] || "ผ")}</span><div><strong>${esc(u.name)}</strong><span>${esc(u.email)}</span><small>${u.role === "staff" ? "เจ้าหน้าที่ดูแลระบบ" : "สมาชิก BSRU Workshop"}</small></div></div>
        <div class="account-menu-group">${item("account-profile", "fa-id-card", "ข้อมูลบัญชีของฉัน")}${item("account-settings", "fa-sliders", "ตั้งค่าบัญชี")}${item("account-password", "fa-lock", "เปลี่ยนรหัสผ่าน")}</div>
        <div class="account-menu-group">${item("page", u.role === "staff" ? "fa-layer-group" : "fa-bookmark", u.role === "staff" ? "จัดการเวิร์กช็อป" : "กิจกรรมของฉัน", `data-id="${u.role === "staff" ? "manage" : "mine"}"`)}${item(u.role === "staff" ? "page" : "support", "fa-circle-question", "ความช่วยเหลือ", u.role === "staff" ? 'data-id="complaints"' : "")}</div>
        <div class="account-menu-group">${item("switch", "fa-repeat", "เปลี่ยนบัญชี")}${item("logout", "fa-arrow-right-from-bracket", "ออกจากระบบ", 'class="account-menu-logout"')}</div>
      </nav></div>`;
  }
  function closeAccountMenu(returnFocus = false) {
    const trigger = $('[data-action="toggle-account-menu"]');
    const dropdown = $("#account-dropdown");
    if (!dropdown || dropdown.hidden) return;
    dropdown.hidden = true;
    trigger?.setAttribute("aria-expanded", "false");
    if (returnFocus) trigger?.focus();
  }
  function accountDetails(u) {
    return `<dl class="account-details">${[
      ["อีเมล", u.email],
      ["รหัสประจำตัว", u.code],
      ["ประเภทผู้ใช้งาน", u.type],
      [
        "สิทธิ์การใช้งาน",
        u.role === "staff" ? "เจ้าหน้าที่ดูแลระบบ" : "สมาชิก",
      ],
      ["คณะ / หน่วยงาน", u.faculty],
      ["สาขา / งาน", u.major],
      ["สถานะบัญชี", labels[u.status] || u.status],
    ]
      .map(
        ([label, value]) =>
          `<div><dt>${label}</dt><dd>${esc(value || "ยังไม่ได้ระบุ")}</dd></div>`,
      )
      .join("")}</dl>`;
  }
  function accountModal(settings = false) {
    const u = user();
    if (!u) return;
    openModal(
      settings ? "ตั้งค่าบัญชี" : "ข้อมูลบัญชีของฉัน",
      settings
        ? `<p class="muted">อัปเดตชื่อและเบอร์โทรศัพท์สำหรับติดต่อคุณ</p><form id="account-settings-form" class="space">${input("ชื่อ-นามสกุล", "account-name", "text", `autocomplete="name" maxlength="120" value="${esc(u.name)}"`)}<div class="field"><label for="account-phone">เบอร์โทรศัพท์ <span class="sub">(ไม่บังคับ)</span></label><input id="account-phone" name="account-phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="10" pattern="0[0-9]{8,9}" value="${esc(u.phone)}"></div><div class="error" role="alert"></div><div class="row"><button class="btn primary" type="submit">บันทึกการเปลี่ยนแปลง</button><button class="btn" type="button" data-action="close">ยกเลิก</button></div></form><div class="account-security"><h3><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ความปลอดภัยบัญชี</h3><p class="muted">${otpAvailable || passwordResetAvailable ? "เปลี่ยนรหัสผ่านโดยยืนยัน OTP ทางอีเมลที่ผูกกับบัญชี" : "การเปลี่ยนรหัสผ่านทางอีเมลยังไม่เปิดให้บริการ กรุณาติดต่อผู้ดูแลระบบ"}</p><button type="button" class="btn small" data-action="account-password">เปลี่ยนรหัสผ่าน</button></div><details class="account-readonly"><summary>ข้อมูลประจำบัญชี</summary>${accountDetails(u)}<p class="sub">หากต้องการแก้ไขอีเมลหรือข้อมูลประจำตัว กรุณาติดต่อผู้ดูแลระบบ</p></details>`
        : `<div class="account-profile-heading"><span class="profile-avatar" aria-hidden="true">${esc(Array.from(u.name)[0] || "ผ")}</span><div><h3>${esc(u.name)}</h3><p class="muted">${esc(u.phone || "ยังไม่ได้ระบุเบอร์โทรศัพท์")}</p></div></div>${accountDetails(u)}<button type="button" class="btn primary" data-action="account-settings">แก้ไขข้อมูลบัญชี</button>`,
    );
  }
  function shell(content) {
    const u = user(),
      a = staff();
    const icons = {
      dashboard: "fa-chart-pie",
      manage: "fa-layer-group",
      workshops: "fa-compass",
      mine: "fa-bookmark",
      approvals: "fa-user-check",
      participants: "fa-users",
      archive: "fa-clock-rotate-left",
      complaints: "fa-comments",
      "my-complaints": "fa-comment-dots",
      reports: "fa-chart-simple",
      notifications: "fa-bell",
    };
    const nav = u
      ? a
        ? [
            ["dashboard", "ภาพรวม"],
            ["manage", "จัดการเวิร์กช็อป"],
            ["approvals", "อนุมัติผู้ใช้งาน"],
            ["participants", "ผู้เข้าร่วมอบรม"],
            ["archive", "เวิร์กช็อปย้อนหลัง"],
            ["complaints", "แจ้งปัญหาและความช่วยเหลือ"],
          ]
        : [
            ["dashboard", "ภาพรวมของฉัน"],
            ["workshops", "ค้นหาเวิร์กช็อป"],
            ["mine", "กิจกรรมของฉัน"],
            ["reports", "ผลการอบรม"],
            ["notifications", "การแจ้งเตือน"],
            ["my-complaints", "คำร้องของฉัน"],
          ]
      : [];
    const active =
      nav.find(([id]) => id === state.page)?.[1] || "พื้นที่การเรียนรู้";
    const unread = u
      ? store.notifications.filter((n) => n.userId === u.id && !n.readAt).length
      : 0;
    return `<a class="skip-link" href="#main-content">ข้ามไปยังเนื้อหา</a><div class="app-frame ${u ? "is-authenticated" : "is-public"}">
      <header class="nav"><div class="wrap navin">
        <div class="brand"><div class="brandmark app-logo"><img src="${LOGO}" alt="BSRU Workshop"></div><div class="brand-copy"><b class="brand-title">ระบบจัดการอบรมและเวิร์กช็อป</b><div class="brand-institution">มหาวิทยาลัยราชภัฏบ้านสมเด็จเจ้าพระยา</div></div></div>
        ${u ? `<div class="workspace-label">พื้นที่ทำงาน <span>/</span> <b>${esc(active)}</b></div>` : '<span class="header-motto"><span class="status-dot"></span> เรียนรู้วันนี้ เติบโตได้ทุกวัน</span>'}
        <div class="header-actions">${u ? `<span class="role-pill ${a || state.portal === "staff" ? "staff-role" : ""}"><i class="fa-solid ${state.portal === "staff" ? "fa-shield-halved" : "fa-graduation-cap"}" aria-hidden="true"></i>${state.portal === "staff" ? "เจ้าหน้าที่" : "ผู้เรียน"}</span>` : ""}
        ${member() ? `<button class="btn icon-button" data-action="page" data-id="notifications" aria-label="การแจ้งเตือน ${unread} รายการที่ยังไม่อ่าน"><i class="fa-regular fa-bell" aria-hidden="true"></i>${unread ? '<span class="notification-dot"></span>' : ""}</button>` : ""}
        ${u ? accountMenu(u) : ""}</div>
      </div></header>
      ${
        u
          ? `<aside class="sidebar"><div class="sidebar-label">${a ? "จัดการพื้นที่การเรียนรู้" : "พื้นที่การเรียนรู้ของคุณ"}</div><nav class="side-nav" aria-label="เมนูหลัก">${nav.map(([id, label]) => `<button data-action="page" data-id="${id}" class="${state.page === id ? "active" : ""}" ${state.page === id ? 'aria-current="page"' : ""}><i class="fa-solid ${icons[id]}" aria-hidden="true"></i><span>${label}</span>${id === "approvals" && store.users.some((x) => x.status === "WAITING") ? `<span class="nav-count">${store.users.filter((x) => x.status === "WAITING").length}</span>` : id === "notifications" && unread ? `<span class="nav-count">${unread}</span>` : ""}</button>`).join("")}</nav>
        <div class="sidebar-note"><span class="note-spark"><i class="fa-solid fa-sparkles fa-star" aria-hidden="true"></i></span><b>ก้าวเล็ก ๆ สู่โอกาสใหม่</b><p>ทุกการเรียนรู้ คืออีกก้าวของการเติบโต</p>${member() ? '<button class="btn small" data-action="page" data-id="workshops">สำรวจเวิร์กช็อป <span aria-hidden="true">↗</span></button>' : '<span class="sub">สร้างประสบการณ์ที่ดีไปด้วยกัน</span>'}</div>
        <div class="sidebar-bottom">${member() ? '<button data-action="support"><i class="fa-regular fa-circle-question" aria-hidden="true"></i> แจ้งปัญหาการใช้งาน</button>' : ""}<button data-action="switch"><i class="fa-solid fa-repeat" aria-hidden="true"></i> เปลี่ยนบัญชี</button><div class="profile-card"><span class="profile-avatar">${esc(Array.from(u.name)[0])}</span><div><b>${esc(u.name)}</b><span>${a ? "เจ้าหน้าที่ดูแลระบบ" : "สมาชิก BSRU Workshop"}</span></div><button data-action="logout" aria-label="ออกจากระบบ"><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i></button></div></div>
      </aside>`
          : ""
      }
      <main id="main-content" class="wrap main" tabindex="-1"><div class="page-stage">${content}</div><footer class="foot"><span>BSRU Workshop<span class="brand-dot">.</span></span><span>เรียนรู้ · สร้างสรรค์ · เติบโตไปด้วยกัน</span><span>มหาวิทยาลัยราชภัฏบ้านสมเด็จเจ้าพระยา</span></footer></main></div>`;
  }
  function promotionItems() {
    const upcoming = store.workshops
      .filter(
        (w) => !w.closed && !w.cancelled && scheduledPhase(w) === "upcoming",
      )
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    return upcoming.length
      ? upcoming
      : [
          {
            id: "welcome",
            title: "พื้นที่แห่งการเรียนรู้และโอกาสใหม่",
            description: "ติดตามเวิร์กช็อปที่กำลังจะเปิดรับสมัครเร็ว ๆ นี้",
            cover: PHOTOS.team,
            place: "BSRU Workshop",
          },
        ];
  }
  function loginPromo() {
    const items = promotionItems();
    const index =
      ((state.promoSlide % items.length) + items.length) % items.length;
    const item = items[index];
    const fallback = item.id === "welcome";
    const date = fallback
      ? "เร็ว ๆ นี้"
      : new Date(item.start).toLocaleDateString("th-TH", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
    return `<div class="login-promo" data-promo-swipe="true" aria-label="ประชาสัมพันธ์เวิร์กช็อป เลื่อนเพื่อดูรายการอื่น"><img class="login-promo-image" src="${esc(item.cover || PHOTOS.team)}" alt="${esc(item.title)}" draggable="false"><div class="login-promo-shade"></div><div class="login-promo-content"><div class="login-promo-top"><span class="login-promo-kicker">${fallback ? "BSRU WORKSHOP" : "UPCOMING WORKSHOP"}</span><span class="login-promo-count">${index + 1} / ${items.length}</span></div><div class="login-promo-copy"><h1>${esc(item.title)}</h1><p>${esc(item.description || "เปิดประสบการณ์ใหม่ เติมทักษะ และเติบโตไปกับชุมชน BSRU")}</p><div class="login-promo-meta"><span><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${date}</span>${!fallback && item.place ? `<span><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(item.place)}</span>` : ""}</div></div><div class="login-promo-bottom"><span><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i> เปิดโอกาสใหม่ไปด้วยกัน</span><span class="login-promo-hint">ปัดหรือเลื่อนเพื่อดูเพิ่มเติม</span></div></div><div class="login-promo-controls"><button type="button" data-action="promo-slide" data-id="prev" aria-label="ประชาสัมพันธ์ก่อนหน้า">←</button>${items.map((_, i) => `<button type="button" data-action="promo-slide" data-id="${i}" class="${i === index ? "active" : ""}" aria-label="ประชาสัมพันธ์รายการที่ ${i + 1}"></button>`).join("")}<button type="button" data-action="promo-slide" data-id="next" aria-label="ประชาสัมพันธ์ถัดไป">→</button></div></div>`;
  }
  function login() {
    return `<section class="login"><div class="intro">${loginPromo()}</div><section class="form"><div class="eyebrow">BSRU WORKSHOP</div><h2>ยินดีต้อนรับกลับมา 👋</h2><p class="muted">เข้าสู่ระบบเพื่อเริ่มต้นการเรียนรู้</p><form id="login-form">${input("อีเมล หรือ เบอร์โทรศัพท์", "identity", "text", 'autocomplete="username" placeholder="กรอกอีเมลหรือเบอร์โทรศัพท์"')}${input("รหัสผ่าน", "password", "password", 'autocomplete="current-password" minlength="6" placeholder="กรอกรหัสผ่าน"')}<div class="error" id="login-error" role="alert"></div><button class="btn primary login-submit" ${!ready ? "disabled" : ""}>เข้าสู่ระบบ <span aria-hidden="true">→</span></button></form>${ready ? `<p class="login-register">ยังไม่มีบัญชี? <button class="btn small" data-action="register">สมัครใช้งานใหม่</button></p>` : ""}${otpAvailable || passwordResetAvailable ? '<button class="btn login-forgot" data-action="forgot">ลืมรหัสผ่าน</button>' : '<div class="notice space">การกู้รหัสผ่านออนไลน์ยังไม่เปิดให้บริการ กรุณาติดต่อเจ้าหน้าที่ผู้ดูแลระบบ</div>'}${localDemo ? `<details class="demo"><summary><i class="fa-solid fa-flask" aria-hidden="true"></i> บัญชีสำหรับทดลองใช้งาน</summary><div class="demo-content">std_demo@bsru.ac.th / 0812345678<br>staff_demo@bsru.ac.th (อาจารย์)<br>รหัสผ่านเริ่มต้น: <b>123456</b><br><span class="sub">หากเปลี่ยนรหัสผ่านแล้ว ให้ใช้รหัสผ่านล่าสุด</span>${!ready ? "<br>กำลังเตรียมระบบเข้าสู่ระบบ…" : ""}</div></details>` : ""}</section></section>`;
  }
  function title(eyebrow, heading, desc, action = "") {
    return `<div class="row between page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${heading}</h1><p class="muted" style="margin:0">${desc}</p></div>${action}</div>`;
  }
  function workshopDetail(id) {
    const w = store.workshops.find((item) => item.id === id);
    if (!w) return;
    const registered = store.registrations.some(
      (r) => r.workshopId === id && r.status !== "CANCELLED",
    );
    openModal(
      esc(w.title),
      '<p class="activity-description">' +
        esc(
          w.description ||
            "ยังไม่มีรายละเอียดเพิ่มเติม กรุณาติดต่อผู้จัดกิจกรรม",
        ) +
        "</p>" +
        workshopMeta(w) +
        '<p class="notice">ชั่วโมงอบรมจะได้รับเมื่อเจ้าหน้าที่ยืนยันการเข้าร่วมแล้ว</p>' +
        (member() &&
        !registered &&
        phase(w) === "upcoming" &&
        occupancy(id) < w.capacity
          ? '<button class="btn primary space" data-action="enroll" data-id="' +
            w.id +
            '">ลงทะเบียนกิจกรรมนี้</button>'
          : '<p class="muted">' +
            (registered ? "คุณลงทะเบียนกิจกรรมนี้แล้ว" : phaseLabel(w)) +
            "</p>"),
    );
  }
  function learnerDashboard() {
    const regs = store.registrations.filter((r) => r.userId === state.userId);
    const upcoming = regs
      .filter((r) => r.status === "PENDING")
      .map((r) => store.workshops.find((w) => w.id === r.workshopId))
      .filter((w) => w && new Date(w.end) > new Date())
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    const next = upcoming[0];
    const unread = store.notifications.filter(
      (n) => n.userId === state.userId && !n.readAt,
    ).length;
    return (
      title(
        "พื้นที่การเรียนรู้",
        "สวัสดี, " + esc(user().name),
        "กิจกรรมและสิ่งที่ต้องทำของคุณ",
        '<span class="sync" data-sync-status role="status">' +
          esc(syncMessage) +
          "</span>",
      ) +
      '<section class="panel next-activity"><span class="eyebrow">กิจกรรมถัดไปของฉัน</span>' +
      (next
        ? "<h2>" +
          esc(next.title) +
          "</h2>" +
          workshopMeta(next) +
          '<button class="btn primary" data-action="workshop-detail" data-id="' +
          next.id +
          '">ดูรายละเอียดกิจกรรม</button>'
        : '<h2>ยังไม่มีกิจกรรมที่กำลังจะเข้าร่วม</h2><p class="muted">เลือกกิจกรรมที่สนใจเพื่อเริ่มต้นการเรียนรู้</p><button class="btn primary" data-action="page" data-id="workshops">ค้นหากิจกรรม</button>') +
      "</section>" +
      '<div class="grid three space"><section class="panel"><h3>กำลังจะเข้าร่วม</h3><strong class="metric">' +
      upcoming.length +
      '</strong><p>กิจกรรม</p></section><section class="panel"><h3>ชั่วโมงสะสม</h3><strong class="metric">' +
      number(regs.reduce((sum, r) => sum + hoursOf(r), 0)) +
      '</strong><p>ยืนยันการเข้าร่วมแล้ว</p></section><section class="panel"><h3>สิ่งที่ต้องตรวจสอบ</h3><p>แจ้งเตือนที่ยังไม่อ่าน ' +
      unread +
      ' รายการ</p><button class="btn" data-action="page" data-id="notifications">ดูการแจ้งเตือน</button></section></div>' +
      '<div class="row between space"><h2>กิจกรรมที่เปิดรับสมัคร</h2><button class="btn" data-action="page" data-id="workshops">ดูทั้งหมด</button></div><div class="grid three space">' +
      (store.workshops
        .filter((w) => phase(w) === "upcoming" && occupancy(w.id) < w.capacity)
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .slice(0, 3)
        .map(card)
        .join("") || empty("ยังไม่มีกิจกรรมเปิดรับสมัคร")) +
      "</div>"
    );
  }
  function staffDashboard() {
    const now = Date.now();
    const campusToday = new Date(now + 7 * 3600000);
    const year = campusToday.getUTCFullYear(),
      month = campusToday.getUTCMonth();
    const months = state.dashboardMonths;
    const calendarStart = Date.UTC(year, month - months + 1, 1);
    const from = calendarStart - 7 * 3600000;
    const monthLabel = (value, full = false) =>
      new Date(value).toLocaleDateString("th-TH", {
        timeZone: "UTC",
        month: full ? "long" : "short",
        year: full ? "numeric" : "2-digit",
      });
    const periodLabel = `${monthLabel(calendarStart)} – ${monthLabel(Date.UTC(year, month, 1))}`;
    // Both graphs use registrations created in the same campus-time window.
    const registrations = store.registrations.filter((r) => {
      const created = +archiveDate(r.createdAt);
      return r.status !== "CANCELLED" && created >= from && created <= now;
    });
    const byMonth = new Map();
    for (const r of registrations) {
      const key = new Date(+archiveDate(r.createdAt) + 7 * 3600000)
        .toISOString()
        .slice(0, 7);
      byMonth.set(key, (byMonth.get(key) || 0) + 1);
    }
    const trend = Array.from({ length: months }, (_, i) => {
      const date = new Date(Date.UTC(year, month - months + i + 1, 1));
      const key = date.toISOString().slice(0, 7);
      return {
        key,
        label: date.toLocaleDateString("th-TH", {
          timeZone: "UTC",
          month: "short",
        }),
        year: date.toLocaleDateString("th-TH", {
          timeZone: "UTC",
          year: "2-digit",
        }),
        fullLabel: monthLabel(+date, true),
        value: byMonth.get(key) || 0,
      };
    });
    const maxValue = Math.max(1, ...trend.map((item) => item.value));
    const ceiling =
      maxValue <= 5
        ? 5
        : Math.ceil(maxValue / Math.pow(10, Math.floor(Math.log10(maxValue)))) *
          Math.pow(10, Math.floor(Math.log10(maxValue)));
    const attended = registrations.filter(
      (r) => r.status === "ATTENDED",
    ).length;
    const absent = registrations.filter((r) => r.status === "ABSENT").length;
    const pending = registrations.filter((r) => r.status === "PENDING").length;
    const recorded = attended + absent;
    const percent = recorded ? (attended / recorded) * 100 : null;
    const percentLabel =
      percent === null
        ? "—"
        : percent.toLocaleString("th-TH", { maximumFractionDigits: 1 }) + "%";
    const tasks = attendanceTasks();
    const waitingUsers = store.users.filter(
      (u) => u.role === "user" && u.status === "WAITING",
    ).length;
    const openComplaints = store.complaints.filter(
      (c) => c.status === "OPEN",
    ).length;
    const taskButton = (action, id, icon, label, count, unit) =>
      `<button type="button" class="staff-task" data-action="${action}" data-id="${esc(id)}"><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${label}</span><b>${number(count)}</b><span>${unit}</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>`;
    const taskItems = [
      tasks.length
        ? taskButton(
            "participants-for",
            tasks[0].id,
            "fa-clipboard-check",
            "บันทึก / ยืนยันผล",
            tasks.length,
            "กิจกรรม",
          )
        : "",
      waitingUsers
        ? taskButton(
            "page",
            "approvals",
            "fa-user-check",
            "อนุมัติผู้ใช้งาน",
            waitingUsers,
            "บัญชี",
          )
        : "",
      openComplaints
        ? taskButton(
            "page",
            "complaints",
            "fa-comments",
            "ตอบคำร้อง",
            openComplaints,
            "เรื่อง",
          )
        : "",
    ].join("");
    const taskSection = taskItems
      ? `<section class="staff-tasks" aria-label="งานค้างปัจจุบัน"><h2>งานค้างปัจจุบัน</h2><div class="staff-task-list">${taskItems}</div></section>`
      : '<div class="staff-all-clear"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ไม่มีงานค้าง</div>';
    const ongoing = (w) =>
      +archiveDate(w.start) <= now && +archiveDate(w.end) > now;
    const current = store.workshops
      .filter(
        (w) =>
          !w.cancelled &&
          !w.attendanceFinalizedAt &&
          +archiveDate(w.end) > now &&
          (ongoing(w) || +archiveDate(w.start) > now),
      )
      .sort(
        (a, b) =>
          Number(ongoing(b)) - Number(ongoing(a)) ||
          archiveDate(a.start) - archiveDate(b.start) ||
          a.id.localeCompare(b.id),
      );
    const table = current
      .slice(0, 5)
      .map((w) => {
        const status = ongoing(w)
          ? "ongoing"
          : w.closed
            ? "closed"
            : "upcoming";
        const label = {
          ongoing: "กำลังดำเนินการ",
          closed: "ปิดรับสมัคร",
          upcoming: "กำลังจะมาถึง",
        }[status];
        return `<tr data-workshop-id="${esc(w.id)}"><td data-label="กิจกรรม"><strong>${esc(w.title)}</strong></td><td data-label="วันเวลา"><time datetime="${esc(w.start)}">${esc(archiveDateLabel(w.start))}</time></td><td data-label="ผู้ลงทะเบียน / ที่นั่ง">${number(occupancy(w.id))} / ${number(w.capacity)}</td><td data-label="สถานะ"><span class="staff-phase is-${status}">${label}</span></td><td><button type="button" class="btn small" data-action="participants-for" data-id="${esc(w.id)}" aria-label="ดูผู้เข้าร่วม ${esc(w.title)}">ดูผู้เข้าร่วม</button></td></tr>`;
      })
      .join("");
    const bars = trend
      .map(
        (item) =>
          `<div class="staff-trend-item ${item.value ? "" : "is-zero"}"><button type="button" class="staff-month-bar" data-action="dashboard-month-info" data-label="${esc(item.fullLabel)}" data-count="${item.value}" aria-label="${esc(item.fullLabel)}: ${number(item.value)} รายการ"><span class="staff-trend-bar"><span class="staff-bar-fill" style="height:${(item.value / ceiling) * 100}%"><span class="staff-bar-value">${number(item.value)}</span></span></span></button><span class="staff-month-label">${esc(item.label)}<small>${esc(item.year)}</small></span></div>`,
      )
      .join("");
    const graph = registrations.length
      ? `<div class="staff-trend-plot" data-months="${months}"><div class="staff-chart-axis" aria-hidden="true"><span>${number(ceiling)}</span><span>${number(ceiling / 2)}</span><span>0</span></div><div class="staff-trend-chart" style="--trend-count:${months}" role="group" aria-label="รายการลงทะเบียนรายเดือน">${bars}</div></div><p class="staff-chart-footnote">แตะหรือชี้แท่งกราฟเพื่อดูจำนวนรายการ</p>`
      : '<div class="staff-empty"><i class="fa-solid fa-chart-column" aria-hidden="true"></i><strong>ยังไม่มีรายการลงทะเบียนในช่วงนี้</strong><span>ข้อมูลจะแสดงเมื่อมีการลงทะเบียน</span></div>';
    const ring = `<div class="staff-donut" role="img" aria-label="${recorded ? `เข้าร่วมแล้ว ${number(attended)} จาก ${number(recorded)} รายการ คิดเป็น ${percentLabel}` : "ยังไม่มีรายการที่บันทึกผลแล้ว"}" style="background:${recorded ? `conic-gradient(var(--staff-attended) 0% ${percent}%, var(--staff-absent) ${percent}% 100%)` : "var(--staff-chart-track)"}"><div class="staff-donut-value"><strong>${percentLabel}</strong><span>${recorded ? "เข้าร่วมจริง" : "ยังไม่มีผล"}</span></div></div>`;
    return `<div class="staff-dashboard"><div class="staff-dashboard-head"><div>${title("STAFF OVERVIEW", "ภาพรวมการอบรม", "ติดตามการลงทะเบียน ผลการเข้าร่วม และงานที่ต้องดำเนินการ")}</div><div class="staff-dashboard-meta"><span class="live-dot" aria-hidden="true"></span><span class="sync" data-sync-status role="status">${esc(syncMessage)}</span></div></div>
      ${taskSection}
      <section class="staff-report" aria-label="สรุปการลงทะเบียนและผลเข้าร่วม"><div class="staff-report-heading"><div><h2>สรุปการอบรม</h2><p>${esc(periodLabel)} · นับตามวันที่ลงทะเบียน · ไม่รวมรายการที่ยกเลิก</p></div><label class="staff-period-label" for="dashboard-period">ช่วงข้อมูลของทั้ง 2 กราฟ<select id="dashboard-period"><option value="6" ${months === 6 ? "selected" : ""}>6 เดือนล่าสุด</option><option value="12" ${months === 12 ? "selected" : ""}>12 เดือนล่าสุด</option></select></label></div>
      <div class="staff-dashboard-grid"><section class="panel staff-trend-panel" aria-labelledby="staff-trend-heading"><div class="staff-panel-heading"><div><h3 id="staff-trend-heading">การลงทะเบียนรายเดือน</h3><p>รวม <strong class="staff-registration-total">${number(registrations.length)}</strong> รายการในช่วงที่เลือก</p></div><span class="staff-chart-unit">หน่วย: รายการ</span></div>${graph}</section>
      <section class="panel staff-donut-panel" aria-labelledby="staff-outcome-heading"><div class="staff-panel-heading"><div><h3 id="staff-outcome-heading">ผลการเข้าร่วม</h3><p>เฉพาะรายการที่บันทึกผลแล้ว</p></div></div>${ring}${recorded ? `<dl class="staff-outcome-legend"><div><dt><i class="is-attended" aria-hidden="true"></i>เข้าร่วมแล้ว</dt><dd>${number(attended)} <small>รายการ</small></dd></div><div><dt><i class="is-absent" aria-hidden="true"></i>ไม่เข้าร่วม</dt><dd>${number(absent)} <small>รายการ</small></dd></div></dl><p class="staff-chart-footnote">คำนวณจาก ${number(recorded)} รายการที่มีผลแล้ว</p>` : '<p class="staff-outcome-empty">ยังคำนวณอัตราเข้าร่วมไม่ได้</p>'}${pending ? `<p class="staff-outcome-pending">ยังไม่มีผลการเข้าร่วม ${number(pending)} รายการ<br><span>ไม่นำมาคำนวณเปอร์เซ็นต์</span></p>` : ""}</section></div></section>
      <details class="staff-activity-details" id="staff-upcoming-details" ${state.dashboardAgendaOpen ? "open" : ""}><summary><span><i class="fa-regular fa-calendar" aria-hidden="true"></i> กิจกรรมปัจจุบันและกิจกรรมถัดไป</span><span class="staff-activity-count">${number(current.length)} กิจกรรม</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary><div class="staff-activity-content"><div class="staff-activity-toolbar"><span>ข้อมูลปัจจุบัน${current.length > 5 ? ` · แสดง 5 จาก ${number(current.length)} กิจกรรม` : ""}</span><button class="btn small" data-action="page" data-id="manage">จัดการเวิร์กช็อปทั้งหมด</button></div>${table ? `<div class="staff-table-wrap"><table class="staff-table"><thead><tr><th scope="col">กิจกรรม</th><th scope="col">วันเวลา</th><th scope="col">ผู้ลงทะเบียน / ที่นั่ง</th><th scope="col">สถานะ</th><th scope="col"><span class="staff-sr-only">เปิดรายชื่อ</span></th></tr></thead><tbody>${table}</tbody></table></div>` : '<p class="staff-empty-note">ยังไม่มีกิจกรรมปัจจุบันหรือกิจกรรมถัดไป</p>'}</div></details></div>`;
  }

  function card(w) {
    const r = store.registrations.find(
        (r) => r.workshopId === w.id && r.userId === state.userId,
      ),
      n = occupancy(w.id),
      a = staff(),
      available = phase(w) === "upcoming" && n < w.capacity;
    return `<article class="card"><div class="cover">${w.cover ? `<img src="${esc(w.cover)}" alt="ภาพประกอบ ${esc(w.title)}" loading="lazy">` : `<i class="fa-solid ${esc(w.icon || "fa-graduation-cap")}"></i>`}<span class="tag">${esc(w.category || "BSRU WORKSHOP")}</span></div><div class="cardbody">${w.photoSource ? `<a class="photo-credit" href="${esc(w.photoSource.url)}" target="_blank" rel="noopener">ภาพประกอบ: ${esc(w.photoSource.credit)}</a>` : ""}<div class="row between"><span class="badge phase-${phase(w)}">${phaseLabel(w)}</span>${r ? badge(r.status) : ""}</div><h3 style="margin-top:14px;min-height:50px"><button class="activity-title" data-action="workshop-detail" data-id="${w.id}">${esc(w.title)}</button></h3>${workshopMeta(w)}<div class="row between" style="font-size:11px"><span class="muted">จำนวนผู้ลงทะเบียน</span><b>${n} / ${w.capacity} ที่นั่ง</b></div><div class="progress"><span style="width:${Math.min(100, (n / w.capacity) * 100)}%"></span></div>${a ? `<button class="btn primary" style="width:100%" data-action="participants-for" data-id="${w.id}">จัดการผู้เข้าร่วม</button><div class="row space"><button class="btn small" data-action="edit-workshop" data-id="${w.id}">แก้ไขกิจกรรม</button>${!w.closed && scheduledPhase(w) !== "finished" ? `<button class="btn small danger" data-action="close-workshop" data-id="${w.id}">ปิดเวิร์กช็อป</button>` : ""}</div>` : r && r.status !== "CANCELLED" ? `<button class="btn" style="width:100%" data-action="page" data-id="mine">ดูกิจกรรมของฉัน →</button>` : `<button class="btn primary" style="width:100%" data-action="enroll" data-id="${w.id}" ${!available ? "disabled" : ""}>${!available ? (n >= w.capacity ? "ที่นั่งเต็ม" : "ปิดรับลงทะเบียน") : r ? "ลงทะเบียนอีกครั้ง" : "ลงทะเบียนเวิร์กช็อป"} &nbsp; →</button>`}</div></article>`;
  }
  function empty(msg) {
    return `<div class="panel empty"><i class="fa-regular fa-folder-open"></i>${esc(msg)}</div>`;
  }
  function downloadCsv(filename, rows) {
    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
  const managementStatuses = [
    ["ongoing", "กำลังดำเนินการ"],
    ["upcoming", "กำลังจะมาถึง"],
    ["closed", "ปิดรับสมัคร"],
    ["finished", "เสร็จสิ้นแล้ว"],
  ];
  const managementStatusLabel = (status) =>
    status === "cancelled"
      ? "ยกเลิกกิจกรรม"
      : managementStatuses.find(([value]) => value === status)?.[1] ||
        "ทุกสถานะ";
  function deletedWorkshopRecords() {
    if (!staff()) return [];
    const calendar = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return (store.auditLog || [])
      .filter(
        (entry) => entry.action === "delete" && entry.entity === "workshops",
      )
      .map((entry) => ({
        id: entry.id || `deleted-${entry.entityId}-${entry.createdAt}`,
        workshopId: entry.entityId,
        title:
          entry.workshop?.title ||
          `เวิร์กช็อปที่ลบแล้ว (รหัส ${entry.entityId})`,
        place: entry.workshop?.place || "",
        deletedAt: entry.createdAt || "",
        deletedDate: Number.isFinite(Date.parse(entry.createdAt))
          ? calendar.format(new Date(entry.createdAt))
          : "",
        deletedBy: entry.actorName || "ไม่ทราบผู้ดำเนินการ",
        workshop: entry.workshop || null,
      }));
  }
  function deletedWorkshopsTable(list) {
    return `<div class="manage-table-wrap"><table class="manage-table manage-deleted-table"><caption class="sr-only">ประวัติกิจกรรมที่ลบไปแล้ว สำหรับแอดมิน</caption><thead><tr><th scope="col">เวิร์กช็อป</th><th scope="col">ลบเมื่อ</th><th scope="col">ลบโดย</th><th scope="col"><span class="sr-only">รายละเอียดประวัติ</span></th></tr></thead><tbody>${list.map((record) => `<tr class="manage-workshop-row manage-deleted-row" data-workshop-id="${esc(record.workshopId)}"><td><button class="manage-workshop-title" data-action="deleted-workshop-detail" data-id="${esc(record.id)}">${esc(record.title)}</button>${!record.workshop ? '<span class="manage-time">บันทึกเก่า · มีเฉพาะรหัสกิจกรรม</span>' : ""}</td><td>${record.deletedAt ? `<time datetime="${esc(record.deletedAt)}">${esc(fmt(record.deletedAt))}</time>` : "ไม่ทราบวันที่"}</td><td><span class="manage-deleted-actor">${esc(record.deletedBy)}</span></td><td><div class="manage-row-actions"><button class="btn small manage-participants" data-action="deleted-workshop-detail" data-id="${esc(record.id)}">ดูประวัติ</button></div></td></tr>`).join("")}</tbody></table></div>`;
  }
  function deletedWorkshopDetail(id) {
    const record = deletedWorkshopRecords().find((entry) => entry.id === id);
    if (!record) return toast("ไม่พบประวัติกิจกรรมนี้");
    const w = record.workshop;
    const fields = [
      ["รหัสกิจกรรม", record.workshopId],
      ["ลบเมื่อ", record.deletedAt ? fmt(record.deletedAt) : "ไม่ทราบวันที่"],
      ["ลบโดย", record.deletedBy],
      ...(w
        ? [
            ["วันจัดกิจกรรมเดิม", `${fmt(w.start)} – ${fmt(w.end)}`],
            ["สถานที่เดิม", w.place],
            [
              "ผู้สมัครก่อนลบ",
              `${w.registrationCount} / ${w.capacity} ที่นั่ง`,
            ],
            ["จำนวนชั่วโมงเดิม", `${w.hours} ชั่วโมง`],
          ]
        : []),
    ];
    openModal(
      "ประวัติกิจกรรมที่ลบไปแล้ว",
      `<p class="manage-deleted-title">${esc(record.title)}</p><dl class="account-details">${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value || "—")}</dd></div>`).join("")}</dl>${w ? '<p class="sub">เก็บไว้เป็นประวัติการลบสำหรับแอดมิน</p>' : '<div class="notice">บันทึกเก่านี้ไม่ได้เก็บชื่อและรายละเอียดกิจกรรมไว้ จึงแสดงได้เฉพาะรหัสและข้อมูลการลบที่มีอยู่</div>'}<button type="button" class="btn" data-action="close">ปิด</button>`,
    );
  }
  function managementTable(list, grouped, showRowStatus) {
    let lastStatus = null;
    const rows = list
      .map((w) => {
        const status = phase(w);
        const group =
          grouped && status !== lastStatus
            ? `<tr class="manage-group-row"><th colspan="4" scope="colgroup"><span class="manage-status manage-status-${status}">${managementStatusLabel(status)}</span></th></tr>`
            : "";
        lastStatus = status;
        const starts = new Date(w.start);
        const date = starts.toLocaleDateString("th-TH", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        const time = starts.toLocaleTimeString("th-TH", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const enrolled = occupancy(w.id);
        return `${group}<tr class="manage-workshop-row" data-workshop-id="${esc(w.id)}">
        <td><button class="manage-workshop-title" data-action="workshop-detail" data-id="${esc(w.id)}">${esc(w.title)}</button>${+archiveDate(w.end) < Date.now() ? `<span class="manage-time">${w.attendanceFinalizedAt ? "ยืนยันผลแล้ว" : attendanceStats(w).pending ? `รอบันทึกผล ${number(attendanceStats(w).pending)} คน` : "บันทึกครบแล้ว · รอยืนยันผล"}</span>` : ""}${showRowStatus ? `<span class="manage-status manage-status-${status} manage-row-status">${managementStatusLabel(status)}</span>` : ""}</td>
        <td><time datetime="${esc(w.start)}">${esc(date)}</time><span class="manage-time">${esc(time)} น.</span></td>
        <td><span class="manage-seat-count" aria-label="ผู้สมัคร ${enrolled} จาก ${w.capacity} ที่นั่ง"><b>${number(enrolled)}</b><span> / ${number(w.capacity)}</span></span>${enrolled >= w.capacity ? '<small class="manage-full">เต็มแล้ว</small>' : ""}</td>
        <td><div class="manage-row-actions"><button class="btn small manage-participants" data-action="participants-for" data-id="${esc(w.id)}" aria-label="ดูผู้เข้าร่วม ${esc(w.title)}">ผู้เข้าร่วม</button><button class="manage-more" data-action="workshop-menu" data-id="${esc(w.id)}" aria-label="จัดการเวิร์กช็อป ${esc(w.title)}" aria-haspopup="menu" aria-expanded="false" aria-controls="workshop-actions-menu"><span aria-hidden="true">⋯</span></button></div></td>
      </tr>`;
      })
      .join("");
    return `<div class="manage-table-wrap"><table class="manage-table"><caption class="sr-only">รายการเวิร์กช็อปตามตัวกรองที่เลือก</caption><thead><tr><th scope="col">เวิร์กช็อป</th><th scope="col">วันจัด</th><th scope="col">ผู้สมัคร / ที่นั่ง</th><th scope="col"><span class="sr-only">จัดการ</span></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function managementPagination(total, pages) {
    if (total <= 10 && state.managePageSize === 10) return "";
    const current = state.managePage;
    const first = (current - 1) * state.managePageSize + 1;
    const last = Math.min(current * state.managePageSize, total);
    const choices = [...new Set([1, pages, current - 1, current, current + 1])]
      .filter((page) => page > 0 && page <= pages)
      .sort((a, b) => a - b);
    let previous = 0;
    const links = choices
      .map((page) => {
        const gap =
          previous && page - previous > 1
            ? '<span class="manage-page-gap" aria-hidden="true">…</span>'
            : "";
        previous = page;
        return `${gap}<button type="button" data-action="manage-page" data-id="${page}" aria-label="หน้า ${page}" ${page === current ? 'aria-current="page"' : ""}>${page}</button>`;
      })
      .join("");
    return `<div class="manage-pagination"><span class="manage-range" role="status">แสดง ${number(first)}–${number(last)} จาก ${number(total)} รายการ</span><label class="manage-page-size">ต่อหน้า <select id="manage-page-size" aria-label="จำนวนเวิร์กช็อปต่อหน้า">${[10, 25, 50].map((size) => `<option value="${size}" ${size === state.managePageSize ? "selected" : ""}>${size}</option>`).join("")}</select></label><nav class="manage-page-links" aria-label="หน้ารายการเวิร์กช็อป"><button type="button" data-action="manage-page" data-id="${current - 1}" aria-label="หน้าก่อนหน้า" ${current === 1 ? "disabled" : ""}>‹</button>${links}<button type="button" data-action="manage-page" data-id="${current + 1}" aria-label="หน้าถัดไป" ${current === pages ? "disabled" : ""}>›</button></nav></div>`;
  }
  function managedWorkshops() {
    const viewingDeleted = state.manageView === "deleted";
    const query = state.search.trim().toLowerCase();
    const history = deletedWorkshopRecords();
    const deleted = history.filter(
      (record) =>
        (!query ||
          `${record.title} ${record.place} ${record.deletedBy} ${record.workshopId}`
            .toLowerCase()
            .includes(query)) &&
        (!state.dateFrom || record.deletedDate >= state.dateFrom) &&
        (!state.dateTo || record.deletedDate <= state.dateTo),
    );
    const base = store.workshops.filter(
      (w) =>
        (!query || `${w.title} ${w.place}`.toLowerCase().includes(query)) &&
        (!state.dateFrom || w.start.slice(0, 10) >= state.dateFrom) &&
        (!state.dateTo || w.start.slice(0, 10) <= state.dateTo),
    );
    const filtered = viewingDeleted
      ? deleted
      : base.filter((w) => state.filter === "all" || phase(w) === state.filter);
    const rank = Object.fromEntries(
      managementStatuses.map(([value], index) => [value, index]),
    );
    filtered.sort((a, b) => {
      if (viewingDeleted) {
        const difference =
          (Date.parse(a.deletedAt) || 0) - (Date.parse(b.deletedAt) || 0);
        return (
          (state.manageSort === "oldest" ? difference : -difference) ||
          a.id.localeCompare(b.id)
        );
      }
      const dateDifference = +new Date(a.start) - +new Date(b.start);
      const tie =
        a.title.localeCompare(b.title, "th") || a.id.localeCompare(b.id);
      if (state.manageSort === "newest") return -dateDifference || tie;
      if (state.manageSort === "oldest") return dateDifference || tie;
      return (
        (rank[phase(a)] ?? 4) - (rank[phase(b)] ?? 4) ||
        (["ongoing", "upcoming"].includes(phase(a))
          ? dateDifference
          : -dateDifference) ||
        tie
      );
    });
    const pages = Math.max(
      1,
      Math.ceil(filtered.length / state.managePageSize),
    );
    state.managePage = Math.max(1, Math.min(state.managePage, pages));
    const shown = filtered.slice(
      (state.managePage - 1) * state.managePageSize,
      state.managePage * state.managePageSize,
    );
    const grouped =
      !viewingDeleted &&
      state.filter === "all" &&
      state.manageSort === "priority";
    const hasFilters = Boolean(
      query ||
      (!viewingDeleted && state.filter !== "all") ||
      state.dateFrom ||
      state.dateTo,
    );
    const dateSelected = Boolean(state.dateFrom || state.dateTo);
    const dateLabel = (date) =>
      new Date(`${date}T00:00`).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    const context = [
      query ? `ค้นหา “${state.search.trim()}”` : "",
      state.dateFrom
        ? `${viewingDeleted ? "ลบตั้งแต่" : "เริ่มตั้งแต่"} ${dateLabel(state.dateFrom)}`
        : "",
      state.dateTo ? `ถึง ${dateLabel(state.dateTo)}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const sortOptions = viewingDeleted
      ? [
          ["priority", "วันที่ลบล่าสุดก่อน"],
          ["oldest", "วันที่ลบเก่าสุดก่อน"],
        ]
      : [
          ["priority", "สถานะและวันเริ่ม"],
          ["newest", "วันเริ่มล่าสุดก่อน"],
          ["oldest", "วันเริ่มเก่าสุดก่อน"],
        ];
    const selectedSort =
      viewingDeleted && state.manageSort === "newest"
        ? "priority"
        : state.manageSort;
    const emptyTitle = viewingDeleted
      ? hasFilters && history.length
        ? "ไม่พบประวัติที่ตรงกับตัวกรอง"
        : "ยังไม่มีประวัติการลบ"
      : store.workshops.length
        ? "ไม่พบเวิร์กช็อปที่ตรงกับตัวกรอง"
        : "ยังไม่มีเวิร์กช็อป";
    return `<section class="manage-view" data-management-view="${viewingDeleted ? "deleted" : "current"}">
      ${title("WORKSHOP MANAGEMENT", "จัดการเวิร์กช็อป", "ค้นหา ติดตามสถานะ และจัดการกิจกรรมของคุณ", '<button class="btn primary" data-action="add-workshop"><i class="fa-solid fa-plus" aria-hidden="true"></i> เพิ่มเวิร์กช็อป</button>')}
      <nav class="manage-view-switch" aria-label="มุมมองรายการเวิร์กช็อป"><button type="button" data-action="manage-view" data-id="current" aria-pressed="${!viewingDeleted}">กิจกรรมปัจจุบัน</button><button type="button" data-action="manage-view" data-id="deleted" aria-pressed="${viewingDeleted}"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> ประวัติการลบ</button></nav>
      <section class="manage-filters" aria-label="ค้นหาและกรองเวิร์กช็อป"><div class="manage-filter-row"><div class="manage-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="search" type="search" aria-label="ค้นหาเวิร์กช็อป" placeholder="${viewingDeleted ? "ค้นหาชื่อกิจกรรม รหัส หรือผู้ลบ" : "ค้นหาชื่อเวิร์กช็อปหรือสถานที่"}" value="${esc(state.search)}"></div>${viewingDeleted ? "" : `<select id="phase-filter" aria-label="สถานะกิจกรรม"><option value="all" ${state.filter === "all" ? "selected" : ""}>ทุกสถานะ</option>${managementStatuses.map(([value, label]) => `<option value="${value}" ${state.filter === value ? "selected" : ""}>${label}</option>`).join("")}</select>`}
      <div id="manage-date-panel" class="manage-date-panel"><label for="date-from">${viewingDeleted ? "ลบตั้งแต่" : "ตั้งแต่"} <input id="date-from" type="date" aria-label="${viewingDeleted ? "วันที่ลบตั้งแต่" : "วันเริ่มตั้งแต่"}" value="${esc(state.dateFrom || "")}"></label><label for="date-to">ถึง <input id="date-to" type="date" aria-label="ถึงวันที่" value="${esc(state.dateTo || "")}"></label>${dateSelected ? '<button class="btn small" data-action="clear-manage-dates">ล้างวันที่</button>' : ""}</div></div></section>
      <section class="manage-results" id="manage-results" tabindex="-1" aria-label="ผลการค้นหาเวิร์กช็อป"><div class="manage-results-heading"><div><h2>${viewingDeleted ? "กิจกรรมที่ลบไปแล้ว" : state.filter === "all" ? "รายการเวิร์กช็อป" : `<span class="manage-status manage-status-${esc(state.filter)}">${managementStatusLabel(state.filter)}</span>`}<span class="manage-result-count">${number(filtered.length)} รายการ</span></h2><p class="manage-result-context">${esc(context)}</p></div><div class="manage-results-tools">${hasFilters ? '<button class="manage-reset" data-action="reset-manage-filters">ล้างตัวกรอง</button>' : ""}<label class="manage-sort-label">เรียงตาม <select id="manage-sort" aria-label="เรียงลำดับเวิร์กช็อป">${sortOptions
        .map(
          ([value, label]) =>
            `<option value="${value}" ${selectedSort === value ? "selected" : ""}>${label}</option>`,
        )
        .join("")}</select></label></div></div>
      ${filtered.length ? (viewingDeleted ? deletedWorkshopsTable(shown) : managementTable(shown, grouped, state.filter === "all" && !grouped)) + managementPagination(filtered.length, pages) : `<div class="manage-empty"><i class="fa-regular fa-folder-open" aria-hidden="true"></i><h3>${emptyTitle}</h3><p>${viewingDeleted ? "รายการที่ลบจะถูกเก็บเป็นประวัติสำหรับแอดมิน" : store.workshops.length ? "ลองเปลี่ยนคำค้นหา สถานะ หรือช่วงวันที่" : "เพิ่มเวิร์กช็อปแรกเพื่อเริ่มรับผู้เข้าร่วม"}</p>${hasFilters ? '<button class="btn" data-action="reset-manage-filters">ล้างตัวกรอง</button>' : ""}</div>`}
      </section></section>`;
  }
  function closeWorkshopMenu(returnFocus = false) {
    $("#workshop-actions-menu")?.remove();
    if (workshopMenuTrigger) {
      workshopMenuTrigger.setAttribute("aria-expanded", "false");
      if (returnFocus && workshopMenuTrigger.isConnected)
        workshopMenuTrigger.focus();
    }
    workshopMenuTrigger = null;
  }
  function openWorkshopMenu(button) {
    if (workshopMenuTrigger === button) return closeWorkshopMenu(true);
    closeWorkshopMenu();
    const w = store.workshops.find((item) => item.id === button.dataset.id);
    if (!w || !staff()) return;
    const menu = document.createElement("div");
    menu.id = "workshop-actions-menu";
    menu.className = "workshop-actions-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", `จัดการ ${w.title}`);
    const item = (action, icon, label, danger = false) =>
      `<button type="button" role="menuitem" class="${danger ? "is-danger" : ""}" data-action="${action}" data-id="${esc(w.id)}"><i class="fa-solid ${icon}" aria-hidden="true"></i>${label}</button>`;
    menu.innerHTML =
      (w.attendanceFinalizedAt
        ? ""
        : item("edit-workshop", "fa-pen", "แก้ไขเวิร์กช็อป")) +
      (!w.closed && !w.cancelled && scheduledPhase(w) !== "finished"
        ? item("close-workshop", "fa-pause", "ปิดรับสมัคร")
        : "") +
      item("delete-workshop", "fa-trash-can", "ลบเวิร์กช็อป", true);
    document.body.appendChild(menu);
    const rect = button.getBoundingClientRect?.() || {
      right: 230,
      bottom: 100,
      top: 56,
    };
    const height = menu.querySelectorAll("button").length * 44 + 16;
    menu.style.left = `${Math.max(12, Math.min(rect.right - 224, (window.innerWidth || 1024) - 236))}px`;
    menu.style.top = `${Math.max(12, rect.bottom + height + 8 > (window.innerHeight || 768) ? rect.top - height - 8 : rect.bottom + 8)}px`;
    workshopMenuTrigger = button;
    button.setAttribute("aria-expanded", "true");
    menu.querySelector("button")?.focus();
  }
  function workshops() {
    if (staff()) return managedWorkshops();
    let list = store.workshops.filter(
      (w) =>
        (state.filter === "all" || phase(w) === state.filter) &&
        (!state.search ||
          (w.title + " " + w.place)
            .toLowerCase()
            .includes(state.search.toLowerCase())) &&
        ((state.view === "open" &&
          (state.filter !== "all" ||
            (phase(w) === "upcoming" && occupancy(w.id) < w.capacity))) ||
          (state.view === "mine" &&
            store.registrations.some(
              (r) => r.workshopId === w.id && r.userId === state.userId,
            ))),
    );
    if (state.page === "mine" && state.mineStatus && state.mineStatus !== "all")
      list = list.filter((w) => {
        const r = store.registrations.find(
          (row) => row.workshopId === w.id && row.userId === state.userId,
        );
        return state.mineStatus === "upcoming"
          ? r?.status === "PENDING"
          : state.mineStatus === "finished"
            ? ["ATTENDED", "ABSENT"].includes(r?.status)
            : r?.status === "CANCELLED";
      });
    if (state.dateFrom)
      list = list.filter((w) => w.start.slice(0, 10) >= state.dateFrom);
    if (state.dateTo)
      list = list.filter((w) => w.start.slice(0, 10) <= state.dateTo);
    return `${title("EXPLORE & REGISTER", state.view === "mine" ? "กิจกรรมของฉัน" : "ค้นพบเวิร์กช็อปที่ใช่", "เลือกกิจกรรมเพื่อพัฒนาทักษะและเปิดประสบการณ์ใหม่")}${
      state.page === "mine"
        ? '<div class="tabs space" aria-label="สถานะการเข้าร่วม">' +
          [
            ["all", "ทั้งหมด"],
            ["upcoming", "รอเข้าร่วม"],
            ["finished", "เสร็จสิ้น"],
            ["cancelled", "ยกเลิก"],
          ]
            .map(
              ([id, label]) =>
                '<button data-action="mine-status" data-id="' +
                id +
                '" class="' +
                ((state.mineStatus || "all") === id ? "active" : "") +
                '">' +
                label +
                "</button>",
            )
            .join("") +
          "</div>"
        : ""
    }<div class="toolbar"><input id="search" aria-label="ค้นหาเวิร์กช็อป" placeholder="ค้นหาชื่อเวิร์กช็อป หรือสถานที่…" value="${esc(state.search)}"><select id="phase-filter" aria-label="สถานะกิจกรรม">${[
      ["all", "ทั้งหมด"],
      ["upcoming", "เร็วๆ นี้"],
      ["ongoing", "ดำเนินการอยู่"],
      ["closed", "ปิดเวิร์กช็อปแล้ว"],
    ]
      .map(
        ([v, l]) =>
          `<option value="${v}" ${state.filter === v ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select><label class="date-filter">ตั้งแต่ <input id="date-from" type="date" value="${esc(state.dateFrom || "")}"></label><label class="date-filter">ถึง <input id="date-to" type="date" value="${esc(state.dateTo || "")}"></label><span class="muted">${list.length} กิจกรรม</span></div>${
      '<div class="grid three">' +
      list
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .map(card)
        .join("") +
      "</div>"
    }${!list.length ? empty("ไม่พบเวิร์กช็อปที่ตรงกับตัวกรอง") : ""}`;
  }
  function reports() {
    const regs = store.registrations.filter((r) => r.userId === state.userId);
    return `${title("MY WORKSHOP REPORT", "รายงานผลและชั่วโมงอบรม", "ชั่วโมงสะสมอัปเดตเมื่อเจ้าหน้าที่บันทึกการเข้าร่วมงาน")}<div class="panel hours-summary space"><div><h2>ชั่วโมงอบรมสะสม</h2><p class="muted">ยืนยันจากสถานะเข้าร่วมงานแล้วเท่านั้น</p></div><strong>${number(regs.reduce((s, r) => s + hoursOf(r), 0))}<small> ชั่วโมง</small></strong></div><div class="space grid">${
      regs
        .map((r) => {
          const w = store.workshops.find((w) => w.id === r.workshopId);
          return `<article class="panel"><div class="row between"><h3>${esc(w.title)}</h3>${badge(r.status)}</div>${workshopMeta(w)}${w.closed ? '<div class="notice">เจ้าหน้าที่ปิดเวิร์กช็อปนี้แล้ว ไม่เปิดรับลงทะเบียนเพิ่ม</div>' : ""}<div class="notice">ชั่วโมงที่ได้รับ: <b>${number(hoursOf(r))} ชั่วโมง</b>${r.status === "PENDING" ? " · รอเจ้าหน้าที่เช็กชื่อ" : ""}</div><div class="row space">${r.status === "PENDING" ? `<button class="btn small danger" data-action="cancel" data-id="${r.id}">ยกเลิกการลงทะเบียน</button>` : ""}${r.status === "CANCELLED" ? `<button class="btn small primary" data-action="enroll" data-id="${w.id}" ${phase(w) !== "upcoming" || occupancy(w.id) >= w.capacity ? "disabled" : ""}>ลงทะเบียนอีกครั้ง</button>` : ""}${!store.ratings.some((x) => x.eventId === r.ratingEvent) ? `<button class="btn small" data-action="rate-open" data-id="${r.id}">ประเมินขั้นตอนลงทะเบียน</button>` : ""}</div><div class="sub space">อัปเดต ${esc(fmt(r.updatedAt))}</div></article>`;
        })
        .join("") ||
      empty("ยังไม่มีรายการลงทะเบียน เริ่มต้นได้ที่หน้าเวิร์กช็อป")
    }</div>`;
  }
  let participantWorkshop = "all";
  function approvalsV2() {
    const query = state.approvalQuery.toLowerCase();
    const list = store.users.filter(
      (u) =>
        u.role === "user" &&
        (state.approvalStatus === "all" || u.status === state.approvalStatus) &&
        (!query ||
          `${u.name} ${u.code} ${u.email} ${u.phone}`
            .toLowerCase()
            .includes(query)),
    );
    return `${title("USER APPROVAL", "อนุมัติผู้ใช้งาน", "ตรวจสอบข้อมูลผู้สมัครใหม่ก่อนเปิดสิทธิ์เข้าใช้งาน")}<div class="staff-work-toolbar staff-filter-grid approvals-filter-grid"><input id="approval-search" type="search" aria-label="ค้นหาผู้สมัคร" placeholder="ค้นหาชื่อ รหัส หรืออีเมล" value="${esc(state.approvalQuery)}"><select id="approval-status" aria-label="กรองสถานะ"><option value="WAITING" ${state.approvalStatus === "WAITING" ? "selected" : ""}>รออนุมัติ</option><option value="APPROVED" ${state.approvalStatus === "APPROVED" ? "selected" : ""}>อนุมัติแล้ว</option><option value="REJECTED" ${state.approvalStatus === "REJECTED" ? "selected" : ""}>ปฏิเสธแล้ว</option><option value="all" ${state.approvalStatus === "all" ? "selected" : ""}>ทั้งหมด</option></select><span class="muted staff-filter-summary">${number(list.length)} รายการ</span></div><div class="panel space tablewrap"><table><thead><tr><th>ผู้สมัคร</th><th>ประเภท / รหัส</th><th>ช่องทางติดต่อ</th><th>คณะ / สาขา</th><th>สถานะ / จัดการ</th></tr></thead><tbody>${list.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.type)}<br>${esc(u.code)}</td><td>${esc(u.email || "—")}<br>${esc(u.phone || "—")}</td><td>${esc(u.faculty)}<br><span class="muted">${esc(u.major || "—")}</span></td><td>${badge(u.status)}${u.status === "WAITING" ? `<div class="staff-row-actions"><button class="btn small primary" data-action="approve" data-id="${u.id}">อนุมัติ</button><button class="btn small danger" data-action="reject" data-id="${u.id}">ปฏิเสธ</button></div>` : ""}</td></tr>`).join("") || `<tr><td colspan="5">${empty("ไม่พบผู้สมัครที่ตรงกับตัวกรอง")}</td></tr>`}</tbody></table></div>`;
  }
  function participantsV2() {
    const selectedWorkshop = store.workshops.find(
      (w) => w.id === participantWorkshop,
    );
    const query = state.participantQuery.toLowerCase();
    const list = store.registrations.filter((r) => {
      const u = store.users.find((x) => x.id === r.userId);
      return (
        (participantWorkshop === "all" ||
          r.workshopId === participantWorkshop) &&
        (state.participantStatus === "all" ||
          r.status === state.participantStatus) &&
        (!query ||
          `${u?.name || ""} ${u?.code || ""} ${u?.email || ""}`
            .toLowerCase()
            .includes(query))
      );
    });
    return `${title("PARTICIPANT LIST", "รายชื่อผู้เข้าร่วมอบรม", "ค้นหา กรอง และบันทึกผลการเข้าร่วมจากรายการจริง")}${attendancePanel(selectedWorkshop)}<div class="staff-work-toolbar staff-filter-grid participants-filter-grid"><input id="participant-search" type="search" aria-label="ค้นหาผู้เข้าร่วม" placeholder="ค้นหาชื่อหรือรหัสนักศึกษา" value="${esc(state.participantQuery)}"><select id="participant-filter" aria-label="เลือกเวิร์กช็อป"><option value="all">ทุกเวิร์กช็อป</option>${store.workshops.map((w) => `<option value="${w.id}" ${participantWorkshop === w.id ? "selected" : ""}>${esc(w.title)} · ${esc(fmt(w.start))}${w.attendanceFinalizedAt ? " · ยืนยันผลแล้ว" : ""}</option>`).join("")}</select><select id="participant-status" aria-label="กรองสถานะ"><option value="all" ${state.participantStatus === "all" ? "selected" : ""}>ทุกสถานะ</option><option value="PENDING" ${state.participantStatus === "PENDING" ? "selected" : ""}>รอบันทึกผล</option><option value="ATTENDED" ${state.participantStatus === "ATTENDED" ? "selected" : ""}>เข้าร่วมแล้ว</option><option value="ABSENT" ${state.participantStatus === "ABSENT" ? "selected" : ""}>ไม่เข้าร่วม</option><option value="CANCELLED" ${state.participantStatus === "CANCELLED" ? "selected" : ""}>ยกเลิก</option></select><button class="btn small staff-filter-export" data-action="export-participants"><i class="fa-solid fa-download" aria-hidden="true"></i> Export CSV</button></div>${
      list.length
        ? `<div class="panel tablewrap"><table><thead><tr><th>ลำดับ</th><th>ชื่อ-นามสกุล</th><th>รหัสประจำตัว</th><th>สถานะ</th><th>เช็กชื่อ</th></tr></thead><tbody>${list
            .map((r, i) => {
              const u = store.users.find((x) => x.id === r.userId);
              return `<tr><td>${i + 1}</td><td><b>${esc(u?.name || "ไม่พบข้อมูล")}</b></td><td>${esc(u?.code || "—")}</td><td>${badge(r.status)}</td><td>${store.workshops.find((w) => w.id === r.workshopId)?.attendanceFinalizedAt ? '<span class="muted">ยืนยันผลแล้ว</span>' : r.status !== "CANCELLED" ? `<button class="btn small primary" data-action="attend" data-id="${r.id}">เข้าร่วมงาน</button><button class="btn small danger" data-action="absent" data-id="${r.id}">ไม่เข้าร่วม</button>` : "ผู้ใช้ยกเลิกแล้ว"}</td></tr>`;
            })
            .join("")}</tbody></table></div>`
        : empty("ยังไม่มีรายชื่อที่ตรงกับตัวกรอง")
    }`;
  }
  const archiveMonths = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
  ];
  function attendanceStats(w) {
    const rows = store.registrations.filter(
      (r) => r.workshopId === w.id && r.status !== "CANCELLED",
    );
    const pending = rows.filter(
      (r) => !["ATTENDED", "ABSENT"].includes(r.status),
    ).length;
    return { total: rows.length, pending, completed: rows.length - pending };
  }
  function attendanceTasks() {
    return pastWorkshops()
      .filter((w) => !w.attendanceFinalizedAt)
      .reverse();
  }
  function attendancePanel(w) {
    if (w?.attendanceFinalizedAt)
      return `<section class="attendance-panel is-complete"><div><h2>ยืนยันผลและเก็บเข้าประวัติแล้ว</h2><p>${esc(w.title)} · ${esc(archiveDateLabel(w.start))} · อ่านอย่างเดียว</p></div></section>`;
    if (w && +archiveDate(w.end) <= Date.now()) {
      const { total, pending, completed } = attendanceStats(w);
      return `<section class="attendance-panel"><div><h2>${pending ? `รอบันทึกผลอีก ${number(pending)} คน` : "บันทึกผลครบแล้ว รอยืนยัน"}</h2><p>${esc(w.title)} · ${esc(archiveDateLabel(w.start))}</p><p>บันทึกแล้ว ${number(completed)} / ${number(total)} คน · ไม่นับรายการที่ยกเลิกลงทะเบียน${!total ? " · ไม่มีผู้ลงทะเบียนที่ต้องบันทึกผล" : ""}</p></div><div class="attendance-actions">${pending ? `<button class="btn small" data-action="attendance-pending" data-id="${esc(w.id)}">ดูรายชื่อที่ยังค้าง</button>` : ""}<button class="btn small primary" data-action="finalize-attendance" data-id="${esc(w.id)}" ${pending || apiSaveCount ? "disabled" : ""}>ยืนยันผลและเก็บเข้าประวัติ</button></div></section>`;
    }
    const tasks = attendanceTasks();
    return tasks.length
      ? `<section class="attendance-panel"><div><h2>มี ${number(tasks.length)} เวิร์กช็อปรอบันทึกหรือยืนยันผล</h2><p>กิจกรรมที่จบแล้วต้องระบุผลให้ครบทุกคนก่อนเก็บเข้าประวัติ</p></div><button class="btn small" data-action="participants-for" data-id="${esc(tasks[0].id)}">เปิดงานที่รอดำเนินการ</button></section>`
      : "";
  }
  function archivedWorkshops() {
    return pastWorkshops().filter(
      (w) => w.attendanceFinalizedAt && attendanceStats(w).pending === 0,
    );
  }
  // Local workshop values describe Thailand time, regardless of the viewer's timezone.
  function archiveDate(value) {
    const text = String(value || "");
    return new Date(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)
        ? text + "+07:00"
        : text,
    );
  }
  function archivePeriod(w) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "numeric",
    }).formatToParts(archiveDate(w.start));
    return Object.fromEntries(
      parts
        .filter((p) => ["year", "month"].includes(p.type))
        .map((p) => [p.type, Number(p.value)]),
    );
  }
  function archiveDateLabel(value) {
    return archiveDate(value).toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      dateStyle: "medium",
      timeStyle: "short",
    });
  }
  function pastWorkshops() {
    return store.workshops
      .filter(
        (w) =>
          !w.cancelled &&
          Number.isFinite(+archiveDate(w.start)) &&
          +archiveDate(w.end) < Date.now(),
      )
      .sort(
        (a, b) =>
          archiveDate(b.start) - archiveDate(a.start) ||
          a.id.localeCompare(b.id),
      );
  }
  function archiveHash() {
    const params = new URLSearchParams();
    if (state.archiveYear) params.set("year", state.archiveYear);
    if (state.archiveMonth !== "all") params.set("month", state.archiveMonth);
    if (state.archiveWorkshop) params.set("workshop", state.archiveWorkshop);
    return "#archive" + (params.size ? "?" + params : "");
  }
  function archiveReplaceRoute() {
    window.history?.replaceState?.(null, "", archiveHash());
  }
  function archivePagination(total, roster = false) {
    const key = roster ? "archiveParticipantPage" : "archivePage";
    const pages = Math.max(1, Math.ceil(total / 10));
    state[key] = Math.max(1, Math.min(state[key], pages));
    const current = state[key];
    if (!total) return "";
    return `<div class="manage-pagination"><span class="manage-range" role="status">แสดง ${number((current - 1) * 10 + 1)}–${number(Math.min(current * 10, total))} จาก ${number(total)} รายการ</span><nav class="manage-page-links" aria-label="หน้ารายการย้อนหลัง"><button type="button" data-action="archive-page" data-id="${current - 1}" aria-label="หน้าก่อนหน้า" ${current === 1 ? "disabled" : ""}>‹</button><span class="archive-page-number">หน้า ${number(current)} / ${number(pages)}</span><button type="button" data-action="archive-page" data-id="${current + 1}" aria-label="หน้าถัดไป" ${current === pages ? "disabled" : ""}>›</button></nav></div>`;
  }
  function archiveRegistrations(workshopId) {
    const query = state.archiveParticipantQuery.trim().toLowerCase();
    const users = new Map(store.users.map((u) => [u.id, u]));
    return store.registrations
      .filter((r) => {
        const u = users.get(r.userId);
        return (
          r.workshopId === workshopId &&
          (state.archiveParticipantStatus === "all" ||
            r.status === state.archiveParticipantStatus) &&
          (!query ||
            `${u?.name || ""} ${u?.code || ""} ${u?.email || ""}`
              .toLowerCase()
              .includes(query))
        );
      })
      .sort((a, b) => {
        const name = (id) => users.get(id)?.name || "";
        return (
          name(a.userId).localeCompare(name(b.userId), "th") ||
          a.id.localeCompare(b.id)
        );
      });
  }
  function archiveRoster(w) {
    const rows = archiveRegistrations(w.id);
    const pagination = archivePagination(rows.length, true);
    const offset = (state.archiveParticipantPage - 1) * 10;
    const period = archivePeriod(w);
    return `<section class="manage-view archive-view archive-roster"><button type="button" class="archive-back" data-action="archive-back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> กลับไปรายการย้อนหลัง</button>
      ${title("WORKSHOP ARCHIVE", esc(w.title), `${archiveMonths[period.month - 1]} พ.ศ. ${period.year + 543} · รายชื่อผู้เข้าร่วมอบรม`, '<span class="archive-readonly"><i class="fa-solid fa-lock" aria-hidden="true"></i> อ่านอย่างเดียว</span>')}
      <div class="archive-context"><div><i class="fa-regular fa-calendar" aria-hidden="true"></i><span>${esc(archiveDateLabel(w.start))} – ${esc(archiveDateLabel(w.end))}<br><span class="muted">${esc(w.place || "ไม่ระบุสถานที่")}</span></span></div><button class="btn small" data-action="archive-detail" data-id="${esc(w.id)}">รายละเอียดกิจกรรม</button></div>
      <div class="manage-filters archive-roster-filters"><label class="manage-search"><span class="sr-only">ค้นหาผู้เข้าร่วมย้อนหลัง</span><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="archive-participant-search" type="search" placeholder="ค้นหาชื่อ รหัส หรืออีเมล" value="${esc(state.archiveParticipantQuery)}"></label><label class="archive-field"><span>สถานะการเข้าร่วม</span><select id="archive-participant-status">${[
        ["all", "ทุกสถานะ"],
        ["ATTENDED", "เข้าร่วมแล้ว"],
        ["ABSENT", "ไม่เข้าร่วม"],
        ["CANCELLED", "ยกเลิกการลงทะเบียน"],
      ]
        .map(
          ([value, label]) =>
            `<option value="${value}" ${value === state.archiveParticipantStatus ? "selected" : ""}>${label}</option>`,
        )
        .join(
          "",
        )}</select></label><button class="btn small" data-action="archive-export" ${!rows.length ? "disabled" : ""}><i class="fa-solid fa-download" aria-hidden="true"></i> ส่งออก CSV</button></div>
      <div class="manage-results-heading"><p>${number(rows.length)} รายชื่อ${state.archiveParticipantStatus !== "all" || state.archiveParticipantQuery ? "ที่ตรงกับตัวกรอง" : ""}</p></div>
      ${
        rows.length
          ? `<div class="panel tablewrap"><table class="archive-roster-table"><thead><tr><th scope="col">ลำดับ</th><th scope="col">ชื่อ–นามสกุล</th><th scope="col">รหัสประจำตัว</th><th scope="col">สถานะการเข้าร่วม</th></tr></thead><tbody>${rows
              .slice(offset, offset + 10)
              .map((r, i) => {
                const u = store.users.find((u) => u.id === r.userId);
                return `<tr><td>${offset + i + 1}</td><td><b>${esc(u?.name || "ไม่พบข้อมูลผู้ใช้งาน")}</b></td><td>${esc(u?.code || "—")}</td><td>${badge(r.status)}</td></tr>`;
              })
              .join("")}</tbody></table></div>`
          : empty("ไม่พบรายชื่อที่ตรงกับตัวกรอง")
      }${pagination}</section>`;
  }
  function workshopArchive() {
    const all = archivedWorkshops();
    const years = [...new Set(all.map((w) => archivePeriod(w).year))].sort(
      (a, b) => b - a,
    );
    const selected = all.find((w) => w.id === state.archiveWorkshop);
    if (selected) return archiveRoster(selected);
    const unfinished = pastWorkshops().find(
      (w) => w.id === state.archiveWorkshop,
    );
    if (unfinished)
      return `<section class="manage-view archive-view">${title("WORKSHOP RESULTS", "กิจกรรมนี้ยังไม่พร้อมเก็บเข้าประวัติ", "กรุณาบันทึกผลให้ครบและยืนยันผลก่อน")}${attendancePanel(unfinished)}<button class="btn" data-action="participants-for" data-id="${esc(unfinished.id)}">ไปหน้าบันทึกผล</button></section>`;
    const missingSelection = !!state.archiveWorkshop;
    state.archiveWorkshop = null;
    if (!years.includes(state.archiveYear)) {
      const currentYear = Number(
        new Intl.DateTimeFormat("en", {
          timeZone: "Asia/Bangkok",
          year: "numeric",
        }).format(new Date()),
      );
      state.archiveYear =
        years.find((year) => year < currentYear) || years[0] || null;
    }
    const yearRows = all.filter(
      (w) => archivePeriod(w).year === state.archiveYear,
    );
    const query = state.archiveQuery.trim().toLowerCase();
    const rows = yearRows.filter(
      (w) =>
        (state.archiveMonth === "all" ||
          archivePeriod(w).month === Number(state.archiveMonth)) &&
        (!query || `${w.title} ${w.place || ""}`.toLowerCase().includes(query)),
    );
    const pagination = archivePagination(rows.length);
    const offset = (state.archivePage - 1) * 10;
    const period = state.archiveYear
      ? `${state.archiveMonth === "all" ? "ทุกเดือน" : archiveMonths[Number(state.archiveMonth) - 1]} · พ.ศ. ${state.archiveYear + 543}`
      : "ยังไม่มีข้อมูลย้อนหลัง";
    const counts = new Map();
    for (const r of store.registrations)
      counts.set(r.workshopId, (counts.get(r.workshopId) || 0) + 1);
    return `<section class="manage-view archive-view">${title("WORKSHOP ARCHIVE", "เวิร์กช็อปย้อนหลัง", "กิจกรรมที่บันทึกผลครบและยืนยันเก็บเข้าประวัติแล้ว")}${attendancePanel()}
      <div class="manage-filters archive-filters"><label class="archive-field"><span>ปีที่จัดกิจกรรม (พ.ศ.)</span><select id="archive-year" ${!years.length ? "disabled" : ""}>${years.length ? years.map((year) => `<option value="${year}" ${year === state.archiveYear ? "selected" : ""}>พ.ศ. ${year + 543}</option>`).join("") : '<option value="">ยังไม่มีข้อมูล</option>'}</select></label><label class="archive-field"><span>เดือนที่เริ่มกิจกรรม</span><select id="archive-month" ${!years.length ? "disabled" : ""}><option value="all" ${state.archiveMonth === "all" ? "selected" : ""}>ทุกเดือน</option>${archiveMonths.map((month, index) => `<option value="${index + 1}" ${state.archiveMonth === String(index + 1) ? "selected" : ""}>${month}</option>`).join("")}</select></label><label class="manage-search"><span class="sr-only">ค้นหาเวิร์กช็อปย้อนหลัง</span><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="archive-search" type="search" placeholder="ค้นหาชื่อเวิร์กช็อป หรือสถานที่" value="${esc(state.archiveQuery)}"></label></div>
      ${missingSelection ? '<p class="notice" role="status">ไม่พบกิจกรรมย้อนหลังนี้ อาจถูกลบหรือเปลี่ยนแปลงแล้ว</p>' : ""}
      <div class="manage-results-heading"><div><h2>${period}</h2><p>${number(rows.length)} กิจกรรม · เรียงจากวันที่จัดล่าสุด</p></div>${state.archiveMonth !== "all" || query ? '<button class="btn small" data-action="archive-clear">ล้างตัวกรอง</button>' : ""}</div>
      ${
        rows.length
          ? `<div class="panel tablewrap"><table class="manage-table archive-table"><thead><tr><th scope="col">เวิร์กช็อป</th><th scope="col">วันที่เริ่มกิจกรรม</th><th scope="col">รายชื่อ</th><th scope="col"><span class="sr-only">เปิดรายชื่อ</span></th></tr></thead><tbody>${rows
              .slice(offset, offset + 10)
              .map((w) => {
                const count = counts.get(w.id) || 0;
                return `<tr class="manage-workshop-row" data-workshop-id="${esc(w.id)}"><td><button class="manage-workshop-title" data-action="archive-detail" data-id="${esc(w.id)}">${esc(w.title)}</button><div class="sub">${esc(w.place || "ไม่ระบุสถานที่")}</div></td><td>${esc(archiveDateLabel(w.start))}</td><td>${number(count)} คน</td><td><button class="btn small" data-action="archive-roster" data-id="${esc(w.id)}">ดูรายชื่อ <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></td></tr>`;
              })
              .join("")}</tbody></table></div>`
          : `<div class="archive-empty">${empty(all.length ? "ไม่พบกิจกรรมในช่วงเวลาหรือคำค้นนี้" : "ยังไม่มีเวิร์กช็อปที่ยืนยันผลแล้ว")}${all.length ? '<p class="muted">ลองเลือกปี เดือน หรือเปลี่ยนคำค้นหา</p>' : ""}</div>`
      }${pagination}<p class="archive-footnote">จัดกลุ่มตามวันที่เริ่มกิจกรรม · เวิร์กช็อปที่ถูกลบอยู่ในเมนูจัดการเวิร์กช็อป › ประวัติการลบ</p></section>`;
  }
  const complaintStatus = (c) =>
    ({
      OPEN: "รอเจ้าหน้าที่ตอบกลับ",
      REPLIED: "เจ้าหน้าที่ตอบกลับแล้ว",
      CLOSED: "ตอบกลับและปิดเรื่องแล้ว",
    })[c.status] || c.status;
  function complaintThread(c) {
    return `<div class="thread-original"><b>เรื่องที่แจ้ง: ${esc(c.issue)}</b><p style="white-space:pre-wrap">${esc(c.detail || "ไม่มีรายละเอียดเพิ่มเติม")}</p><div class="sub">ส่งเมื่อ ${esc(fmt(c.createdAt))}</div></div>${(c.replies || []).map((r) => `<div class="thread-reply"><b>คำตอบจาก ${esc(r.staffName)}</b><p style="white-space:pre-wrap">${esc(r.text)}</p><div class="sub">${esc(fmt(r.createdAt))}</div></div>`).join("")}`;
  }
  function complaints() {
    return `${title("SUPPORT CENTER", "รายการคำร้องเรียน", "อ่านข้อความและตอบกลับผู้ใช้งานโดยตรงในแอป")}<div class="grid space">${
      store.complaints
        .slice()
        .reverse()
        .map(
          (c) =>
            `<article class="panel"><div class="row between"><h3>${esc(c.issue)}</h3><span class="badge ${c.status === "OPEN" ? "PENDING" : "APPROVED"}">${complaintStatus(c)}</span></div><p>${esc(c.name)} · ${esc(c.code)}<br><span class="muted">${esc(c.contact)}</span></p>${complaintThread(c)}<button class="btn small primary space" data-action="reply-open" data-id="${c.id}">เขียนคำตอบกลับ</button></article>`,
        )
        .join("") || empty("ยังไม่มีคำร้องเรียน")
    }</div>`;
  }
  function myComplaints() {
    const list = store.complaints.filter((c) => c.userId === state.userId);
    return `${title("MY SUPPORT REQUESTS", "คำร้องของฉัน", "ติดตามเรื่องที่ส่งและอ่านคำตอบจากเจ้าหน้าที่", `<button class="btn primary" data-action="support">ส่งคำร้องใหม่</button>`)}<div class="grid space">${
      list
        .slice()
        .reverse()
        .map(
          (c) =>
            `<article class="panel"><div class="row between"><h3>${esc(c.issue)}</h3><span class="badge ${c.status === "OPEN" ? "PENDING" : "APPROVED"}">${complaintStatus(c)}</span></div>${complaintThread(c)}</article>`,
        )
        .join("") || empty("คุณยังไม่มีคำร้องเรียน")
    }</div>`;
  }
  function replyModal(id) {
    if (!staff()) return;
    const c = store.complaints.find((c) => c.id === id);
    if (!c) return;
    openModal(
      "ตอบกลับคำร้องเรียน",
      `${complaintThread(c)}<form id="reply-form" data-id="${c.id}" class="space"><div class="field"><label for="reply-text">ข้อความตอบกลับถึงผู้ใช้</label><textarea id="reply-text" name="reply" required minlength="1" maxlength="3000" placeholder="อธิบายการแก้ไข หรือแนะนำขั้นตอนให้ผู้ใช้งาน"></textarea></div><div class="field"><label for="reply-status">สถานะหลังตอบกลับ</label><select id="reply-status" name="status"><option value="REPLIED">ตอบกลับแล้ว / รอติดตามผล</option><option value="CLOSED">ตอบกลับและปิดเรื่อง</option></select></div><div class="error" role="alert"></div><button class="btn primary">ส่งคำตอบกลับ</button></form>`,
    );
  }
  function notifyUser(userId, title, body, kind, refId) {
    store.notifications.unshift({
      id: uid(),
      userId,
      title,
      body,
      kind,
      refId,
      createdAt: new Date().toISOString(),
      readAt: null,
    });
  }
  function notifications() {
    const list = store.notifications.filter((n) => n.userId === state.userId),
      isActivity = (n) =>
        ["attendance", "registration", "workshop"].includes(n.kind),
      visible = list.filter(
        (n) =>
          (state.notificationFilter === "activity"
            ? isActivity(n)
            : !isActivity(n)) &&
          (!state.notificationQuery ||
            (n.title + " " + n.body)
              .toLowerCase()
              .includes(state.notificationQuery.toLowerCase())),
      ),
      generalCount = list.filter((n) => !isActivity(n)).length,
      activityCount = list.filter(isActivity).length,
      unread = visible.filter((n) => !n.readAt).length;
    return `${title("YOUR UPDATES", "การแจ้งเตือน", "ติดตามข่าวสารและความเคลื่อนไหวของเวิร์กช็อปได้ที่นี่")}<section class="notification-page"><div class="notification-toolbar"><div class="notification-tabs" role="tablist" aria-label="หมวดการแจ้งเตือน"><button class="notification-tab ${state.notificationFilter === "general" ? "active" : ""}" role="tab" aria-selected="${state.notificationFilter === "general"}" data-action="notification-filter" data-id="general">ทั่วไป <span>${generalCount}</span></button><button class="notification-tab ${state.notificationFilter === "activity" ? "active" : ""}" role="tab" aria-selected="${state.notificationFilter === "activity"}" data-action="notification-filter" data-id="activity">กิจกรรม <span>${activityCount}</span></button></div><label class="notification-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="notification-search" type="search" aria-label="ค้นหาการแจ้งเตือน" placeholder="ค้นหาการแจ้งเตือน" value="${esc(state.notificationQuery)}"></label></div><p class="notification-summary" aria-live="polite">${visible.length} รายการ · ยังไม่อ่าน ${unread} รายการ</p><div class="notification-list">${
      visible
        .map((n) => {
          const icon =
              n.kind === "attendance"
                ? "fa-user-check"
                : n.kind === "complaint"
                  ? "fa-comment-dots"
                  : n.kind === "account"
                    ? "fa-user-shield"
                    : "fa-newspaper",
            source = isActivity(n)
              ? "กิจกรรม BSRU"
              : n.kind === "complaint"
                ? "คำร้องของฉัน"
                : n.kind === "account"
                  ? "บัญชี BSRU"
                  : "ข่าวสาร BSRU";
          return `<button class="notification-card ${n.readAt ? "read" : "unread"}" data-action="notification-read" data-id="${n.id}" aria-label="เปิดอ่าน ${esc(n.title)}"><span class="notification-icon" aria-hidden="true"><i class="fa-solid ${icon}"></i></span><span class="notification-copy"><span class="notification-meta"><span class="notification-source">${source}</span><span class="notification-state">${n.readAt ? "อ่านแล้ว" : "ใหม่"}</span></span><strong>${esc(n.title)}</strong><span class="notification-message">${esc(n.body)}</span><time datetime="${esc(n.createdAt)}">${esc(fmt(n.createdAt))}</time></span><span class="notification-chevron" aria-hidden="true">›</span></button>`;
        })
        .join("") ||
      `<div class="notification-empty"><span class="notification-empty-icon"><i class="fa-solid fa-bell-slash" aria-hidden="true"></i></span><h2>${state.notificationQuery ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีการแจ้งเตือน"}</h2><p>${state.notificationQuery ? "ลองค้นหาด้วยคำอื่น" : "เมื่อมีข่าวสารหรืออัปเดตจากเวิร์กช็อป รายการจะแสดงที่นี่"}</p>${state.notificationQuery ? '<button class="btn small" data-action="clear-notification-search">ล้างคำค้นหา</button>' : ""}</div>`
    }</div></section>`;
  }
  async function readNotification(id) {
    if (!member()) return;
    const n = store.notifications.find(
      (n) => n.id === id && n.userId === state.userId,
    );
    if (!n) return;
    n.readAt = n.readAt || new Date().toISOString();
    await commit();
    const c =
      n.kind === "complaint"
        ? store.complaints.find(
            (c) => c.id === n.refId && c.userId === state.userId,
          )
        : null;
    openModal(
      "รายละเอียดการแจ้งเตือน",
      `<h3>${esc(n.title)}</h3><p style="white-space:pre-wrap">${esc(n.body)}</p><p class="sub">${esc(fmt(n.createdAt))}</p>${c ? complaintThread(c) : ""}<button class="btn primary space" data-action="notification-go" data-id="${c ? "my-complaints" : "reports"}">${c ? "ดูคำร้องของฉัน" : "ดูรายงานผลและชั่วโมงอบรม"}</button>`,
    );
  }
  let pendingConfirm = null,
    confirmReturn = null;
  function askConfirm(message) {
    if (pendingConfirm) return Promise.resolve(false);
    confirmReturn = document.activeElement;
    return new Promise((resolve) => {
      pendingConfirm = resolve;
      $("#confirm-root").innerHTML =
        `<div class="dialog-back confirm-back"><section class="dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message"><h2 id="confirm-title">ยืนยันการดำเนินการ</h2><p id="confirm-message">${esc(message)}</p><div class="row" style="justify-content:flex-end"><button class="btn" data-action="answer-no">ไม่ใช่ / กลับไปแก้ไข</button><button class="btn primary" data-action="answer-yes">ใช่ ยืนยัน</button></div></section></div>`;
      $('#confirm-root [data-action="answer-no"]')?.focus();
    });
  }
  function finishConfirm(answer) {
    const resolve = pendingConfirm;
    pendingConfirm = null;
    $("#confirm-root").innerHTML = "";
    confirmReturn?.focus?.();
    if (resolve) resolve(answer);
  }
  let previousView = null;
  let restoringNavigation = false;
  const routePages = [
    "dashboard",
    "workshops",
    "mine",
    "reports",
    "notifications",
    "my-complaints",
    "manage",
    "approvals",
    "participants",
    "archive",
    "complaints",
  ];
  const requestedPage = () => {
    const [page, query = ""] = (window.location?.hash || "")
      .slice(1)
      .split("?");
    if (page === "archive") {
      const params = new URLSearchParams(query);
      state.archiveYear = Number(params.get("year")) || null;
      const month = Number(params.get("month"));
      state.archiveMonth = month >= 1 && month <= 12 ? String(month) : "all";
      state.archiveWorkshop = params.get("workshop") || null;
      state.archiveParticipantQuery = "";
      state.archiveParticipantStatus = "all";
      state.archiveParticipantPage = 1;
    }
    return routePages.includes(page) ? page : "dashboard";
  };
  window.addEventListener?.("popstate", () => {
    if (!user()) return;
    restoringNavigation = true;
    state.page = requestedPage();
    state.view = state.page === "mine" ? "mine" : "open";
    render();
    restoringNavigation = false;
  });
  function renderBootstrap() {
    const loadingData = bootstrapStage === "data";
    let screen = $(".app-bootstrap");
    // Change only the status text so the logo animation stays steady.
    if (!screen || screen.dataset.bootstrapError !== String(bootstrapError)) {
      $("#app").innerHTML =
        `<main class="app-bootstrap" data-bootstrap-error="${bootstrapError}">
        <section class="app-bootstrap-content" ${bootstrapError ? 'role="alert"' : 'role="status" aria-live="polite" aria-busy="true"'}>
          <div class="app-bootstrap-emblem" aria-hidden="true"><span class="app-bootstrap-orbit"></span><img class="app-bootstrap-logo" src="${LOGO}" alt="" width="90" height="92"></div>
          <h1>${bootstrapError ? "ขอเวลาเชื่อมต่ออีกครั้ง" : "กำลังเตรียมพื้นที่การเรียนรู้"}</h1>
          <p id="bootstrap-message"></p>
          <div class="app-bootstrap-progress" aria-hidden="true"><span></span></div>
          ${bootstrapError ? '<button class="btn primary app-bootstrap-retry" type="button" data-action="retry-bootstrap">ลองเชื่อมต่ออีกครั้ง <span aria-hidden="true">↗</span></button>' : ""}
        </section>
      </main>`;
      screen = $(".app-bootstrap");
    }
    screen.dataset.bootstrapStage = bootstrapStage;
    $("#bootstrap-message").textContent = bootstrapError
      ? "ยังโหลดข้อมูลไม่ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง"
      : loadingData
        ? "กำลังโหลดเวิร์กช็อปและข้อมูลบัญชีของคุณ"
        : "กำลังตรวจสอบการเข้าสู่ระบบของคุณ";
  }
  function render() {
    closeWorkshopMenu();
    // A missing user is not a signed-out session until bootstrap completes.
    if (!ready) {
      return renderBootstrap();
    }
    let content;
    if (!user()) content = login();
    else if (state.page === "dashboard")
      content = staff() ? staffDashboard() : learnerDashboard();
    else if (staff())
      content = (
        {
          manage: workshops,
          approvals: approvalsV2,
          participants: participantsV2,
          archive: workshopArchive,
          complaints,
        }[state.page] || learnerDashboard
      )();
    else if (state.page === "mine") {
      state.view = "mine";
      content = workshops();
    } else
      content = (
        { workshops, reports, notifications, "my-complaints": myComplaints }[
          state.page
        ] || learnerDashboard
      )();
    const view = [
      state.portal,
      state.userId,
      state.page,
      state.page === "archive" ? state.archiveWorkshop || "list" : "",
    ].join(":");
    const changed = view !== previousView;
    const hadView = previousView !== null;
    $("#app").innerHTML = shell(content);
    if (user() && registrationProvider === "password") {
      const changePassword = document.createElement("button");
      changePassword.dataset.action = "change-password";
      changePassword.textContent = "เปลี่ยนรหัสผ่าน";
      document.querySelector(".sidebar-bottom")?.prepend(changePassword);
    }
    if (changed) {
      $(".page-stage")?.classList.add("is-entering");
      if (hadView) {
        window.scrollTo({ top: 0, behavior: "auto" });
        $("#main-content")?.focus({ preventScroll: true });
      }
    }
    if (
      user() &&
      changed &&
      !restoringNavigation &&
      window.history?.pushState
    ) {
      const hash =
        state.page === "archive" && staff() ? archiveHash() : "#" + state.page;
      if (window.location.hash !== hash)
        window.history.pushState(null, "", hash);
    }
    previousView = view;
  }
  function openModal(title, body) {
    modalReturn = document.activeElement;
    $("#modal-root").innerHTML =
      `<div class="dialog-back"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1"><div class="top"><h2 id="dialog-title">${title}</h2><button class="close" data-action="close" aria-label="ปิดหน้าต่าง">✕</button></div>${body}</section></div>`;
    $("#modal-root input, #modal-root select, #modal-root button")?.focus();
  }
  function closeModal() {
    $("#modal-root").innerHTML = "";
    if (modalReturn?.isConnected) modalReturn.focus();
    else $("#app button")?.focus();
  }
  function confirmModal(msg, action, id) {
    openModal(
      "ยืนยันการดำเนินการ",
      `<p>${esc(msg)}</p><div class="row" style="justify-content:flex-end"><button class="btn" data-action="close">ไม่ใช่</button><button class="btn primary" data-action="${action}" data-id="${id}">ใช่</button></div>`,
    );
  }
  let emailRegistration = null,
    emailTimer = null;
  function saveEmailRegistration() {
    try {
      window.sessionStorage?.setItem(
        "bsru-email-registration",
        JSON.stringify(emailRegistration),
      );
    } catch {}
  }
  function registrationFieldsError(form, error) {
    if (!form) return;
    const field = form.querySelector('[name="' + error.field + '"]');
    const message = form.querySelector('[data-error="' + error.field + '"]');
    if (field && message) {
      message.textContent = error.message;
      field.setAttribute("aria-invalid", "true");
      field.focus();
    } else {
      const target = form.querySelector(".error");
      if (target) target.textContent = error.message;
    }
  }
  function registerModal() {
    if (user()) return;
    openModal(
      "สมัครสมาชิก",
      `<p class="muted">${registrationProvider === "password" ? "กรอกข้อมูลและตั้งรหัสผ่าน สมัครสำเร็จแล้วเข้าสู่ระบบได้ทันที" : "กรอกข้อมูลและตั้งรหัสผ่าน จากนั้นยืนยันอีเมลเพื่อเริ่มใช้งาน"}</p>
      ${!registrationAvailable ? '<div class="notice">ระบบสมัครสมาชิกยังไม่พร้อม กรุณาติดต่อผู้ดูแลระบบเพื่อตั้งค่าการยืนยันอีเมล</div>' : ""}
      <form id="email-register-form" class="registration-form" novalidate>
      ${input("ชื่อ-นามสกุล", "name", "text", 'autocomplete="name" maxlength="120"')}<p class="field-error" data-error="name" role="alert"></p>
      <div class="field"><label for="registration-type">ประเภทผู้ใช้งาน</label><select id="registration-type" name="type"><option>นักศึกษา</option><option>อาจารย์</option><option>เจ้าหน้าที่</option></select></div><p class="field-error" data-error="type" role="alert"></p>
      ${input("รหัสประจำตัว", "code", "text", 'maxlength="30"')}<p class="field-error" data-error="code" role="alert"></p>
      ${input("เบอร์โทรศัพท์", "phone", "tel", 'autocomplete="tel" maxlength="10"')}<p class="field-error" data-error="phone" role="alert"></p>
      ${input("อีเมลมหาวิทยาลัย (@bsru.ac.th)", "email", "email", 'autocomplete="email" maxlength="150" placeholder="student@bsru.ac.th"')}<p class="field-error" data-error="email" role="alert"></p>
      <p id="registration-password-hint" class="sub">${passwordPolicy}</p>
      ${input("รหัสผ่าน", "password", "password", 'autocomplete="new-password" minlength="12" maxlength="128" aria-describedby="registration-password-hint"')}<p class="field-error" data-error="password" role="alert"></p>
      <div class="error" role="alert"></div><button class="btn primary" type="submit" ${!registrationAvailable ? "disabled" : ""}>สมัครสมาชิก</button>
      </form>`,
    );
  }
  function firebaseLinkModal(email, verified = false) {
    clearInterval(emailTimer);
    openModal(
      verified ? "ยืนยันอีเมลแล้ว" : "ตรวจอีเมลเพื่อยืนยันบัญชี",
      `<p>${verified ? "อีเมลนี้ยืนยันแล้ว กลับไปเข้าสู่ระบบด้วยรหัสผ่านที่ตั้งไว้ได้เลย" : `เปิดอีเมลที่ส่งไปยัง <b>${esc(email)}</b> แล้วคลิกลิงก์ยืนยัน จากนั้นกลับมาเข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่ตั้งไว้`}</p>
      ${!verified ? `<p class="sub">ตรวจทั้ง Inbox และ Spam หากไม่พบอีเมล ให้รออย่างน้อย 60 วินาทีแล้วขอส่งลิงก์อีกครั้ง ข้อมูลสมัครมีอายุ 24 ชั่วโมง</p><details class="space"><summary>ขอส่งลิงก์ยืนยันอีกครั้ง</summary><form id="firebase-resend-form" class="space" novalidate>${input("อีเมลมหาวิทยาลัย", "email", "email", `value="${esc(email)}" autocomplete="email" maxlength="150"`)}${input("รหัสผ่านที่ตั้งไว้", "password", "password", 'autocomplete="current-password" maxlength="128"')}<div class="error" role="alert"></div><button class="btn" type="submit">ส่งลิงก์อีกครั้ง</button></form></details>` : ""}
      <button class="btn primary space" data-action="firebase-login" data-email="${esc(email)}">กลับไปเข้าสู่ระบบ</button>`,
    );
  }
  function firebaseResetModal() {
    openModal(
      "ลืมรหัสผ่าน",
      `<p>กรอกอีเมลเพื่อรับลิงก์ตั้งรหัสผ่านใหม่</p><p class="sub">สำหรับบัญชีที่สมัครด้วยระบบยืนยันลิงก์อีเมล บัญชีเดิมก่อนเปลี่ยนระบบให้ติดต่อเจ้าหน้าที่</p><form id="firebase-reset-form" novalidate>${input("อีเมลมหาวิทยาลัย (@bsru.ac.th)", "email", "email", 'autocomplete="email" maxlength="150"')}<div class="error" role="alert"></div><button class="btn primary" type="submit">ส่งลิงก์ตั้งรหัสผ่านใหม่</button></form>`,
    );
  }
  function emailOtpModal() {
    clearInterval(emailTimer);
    openModal(
      "ยืนยันอีเมล",
      `<p>กรอกรหัส 6 หลักเพื่อยืนยัน <b>${esc(emailRegistration.maskedEmail)}</b></p>
      <p class="sub" data-email-expiry></p><form id="email-otp-form" novalidate>
      ${input("รหัสยืนยันอีเมล", "otp", "text", 'inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}"')}
      <p class="field-error" data-error="otp" role="alert"></p><div class="error" role="alert"></div><button class="btn primary" type="submit">ยืนยันอีเมล</button></form>
      <div class="row space"><button class="btn" data-action="email-resend">ส่งรหัสอีกครั้ง</button><button class="btn" data-action="email-edit">แก้ไขอีเมล</button></div>
      <form id="email-edit-form" hidden novalidate class="space">${input("อีเมลใหม่ (@bsru.ac.th)", "email", "email", 'autocomplete="email" maxlength="150"')}<p class="field-error" data-error="email" role="alert"></p><div class="error" role="alert"></div><button class="btn primary" type="submit">ส่งรหัสไปยังอีเมลใหม่</button></form>
      <p class="sub" data-email-status role="status"></p><button class="btn" data-action="registration-login">กลับไปเข้าสู่ระบบ</button>`,
    );
    const tick = () => {
      const target = document.querySelector("[data-email-expiry]");
      if (!target) {
        clearInterval(emailTimer);
        return;
      }
      const remaining = Math.max(
        0,
        Math.ceil(
          (Date.parse(emailRegistration.expiresAt) - Date.now()) / 1000,
        ),
      );
      target.textContent = remaining
        ? "รหัสหมดอายุใน " +
          Math.floor(remaining / 60) +
          ":" +
          String(remaining % 60).padStart(2, "0") +
          " นาที"
        : "รหัสหมดอายุแล้ว กรุณากดส่งรหัสอีกครั้ง";
      const resend = document.querySelector('[data-action="email-resend"]');
      const wait = Math.max(
        0,
        Math.ceil((Date.parse(emailRegistration.resendAt) - Date.now()) / 1000),
      );
      if (resend) {
        resend.disabled = Boolean(wait) || emailBusy;
        resend.textContent = wait
          ? "ส่งรหัสอีกครั้ง (" + wait + " วินาที)"
          : "ส่งรหัสอีกครั้ง";
      }
    };
    tick();
    emailTimer = setInterval(tick, 1000);
  }
  let emailBusy = false;
  async function emailAction(action, extra = {}) {
    if (emailBusy) return;
    emailBusy = true;
    document
      .querySelectorAll(".dialog button")
      .forEach((b) => (b.disabled = true));
    const status = document.querySelector("[data-email-status]");
    if (status)
      status.textContent =
        action === "verify" ? "กำลังตรวจสอบ…" : "กำลังส่งรหัส…";
    try {
      const result = await apiRequest("/api/registration/" + action, {
        method: "POST",
        body: JSON.stringify({ ...emailRegistration, ...extra }),
      });
      if (action === "verify") {
        apiCsrf = result.csrf;
        emailRegistration = null;
        saveEmailRegistration();
        clearInterval(emailTimer);
        Object.assign(store, (await apiRequest("/api/store")).store);
        state.portal = result.user.role;
        state.userId = result.user.id;
        state.page = "dashboard";
        closeModal();
        startApiPolling();
        render();
        toast("ยืนยันอีเมลสำเร็จ ยินดีต้อนรับ");
      } else {
        emailRegistration = { ...emailRegistration, ...result };
        saveEmailRegistration();
        emailBusy = false;
        emailOtpModal();
      }
    } catch (error) {
      if (error.registration) {
        emailRegistration = { ...emailRegistration, ...error.registration };
        saveEmailRegistration();
        emailBusy = false;
        emailOtpModal();
      }
      registrationFieldsError(
        document.querySelector(
          action === "email" && !error.registration
            ? "#email-edit-form"
            : "#email-otp-form",
        ),
        error,
      );
      if (status) status.textContent = "";
    } finally {
      emailBusy = false;
      document
        .querySelectorAll(".dialog button")
        .forEach((b) => (b.disabled = false));
    }
  }
  async function restoreEmailRegistration() {
    if (registrationProvider !== "resend") return;
    try {
      const pending = JSON.parse(
        window.sessionStorage?.getItem("bsru-email-registration") || "null",
      );
      if (!pending || user()) return;
      const result = await apiRequest("/api/registration/status", {
        method: "POST",
        body: JSON.stringify(pending),
      });
      emailRegistration = { ...pending, ...result };
      emailOtpModal();
    } catch {
      try {
        window.sessionStorage?.removeItem("bsru-email-registration");
      } catch {}
    }
  }
  function passwordFields(name, confirmation) {
    return `${input("รหัสผ่านใหม่", name, "password", 'autocomplete="new-password" minlength="12" maxlength="128" aria-describedby="password-hint"')}${input("ยืนยันรหัสผ่าน", confirmation, "password", 'autocomplete="new-password" minlength="12" maxlength="128"')}<p class="sub" id="password-hint">${passwordPolicy}<br>เช่น ใช้วลีที่จำได้ผสมอักษร ตัวเลข และสัญลักษณ์ โดยไม่ใช้ข้อมูลส่วนตัว</p><div class="sub" id="password-strength" aria-live="polite"></div>`;
  }
  function forgotModal() {
    if (!state.portal) return;
    if (registrationProvider === "password") {
      if (!otpAvailable)
        return toast(
          "ยังไม่ได้ตั้งค่าอีเมลสำหรับส่ง OTP กรุณาติดต่อผู้ดูแลระบบ",
        );
      openModal(
        user() ? "เปลี่ยนรหัสผ่าน" : "ลืมรหัสผ่าน",
        `<p class="muted">กรอกอีเมลที่ใช้สมัครสมาชิก ระบบจะส่ง OTP 6 หลักเพื่อยืนยันก่อนตั้งรหัสผ่านใหม่</p><form id="forgot-form" class="space">${input("อีเมลที่ใช้สมัครสมาชิก", "reset-contact", "email", `autocomplete="email" maxlength="150" ${user() ? `value="${esc(user().email)}" readonly` : ""}`)}<div class="error" role="alert"></div><button class="btn primary" type="submit">ส่ง OTP ไปยังอีเมล</button></form>`,
      );
      return;
    }
    if (passwordResetAvailable) return firebaseResetModal();
    if (!otpAvailable)
      return toast(
        "การกู้รหัสผ่านออนไลน์ยังไม่เปิดให้บริการ กรุณาติดต่อเจ้าหน้าที่ผู้ดูแลระบบ",
      );
    openModal(
      "ลืมรหัสผ่าน",
      `<p class="muted">เลือกช่องทางที่ผูกกับบัญชี ของคุณ เพื่อรับ OTP แล้วตั้งรหัสผ่านใหม่</p><div class="notice">โหมดสาธิต: OTP จะแสดงในกล่องข้อความของแอป ไม่มีการส่งอีเมลหรือ SMS จริง</div><form id="forgot-form" class="space"><div class="field"><label for="recovery-channel">รับ OTP ผ่าน</label><select id="recovery-channel" name="channel"><option value="email">อีเมล</option><option value="phone">เบอร์โทรศัพท์</option></select></div>${input("อีเมลหรือเบอร์โทรศัพท์ที่ผูกกับบัญชี", "reset-contact", "text", 'autocomplete="email tel" maxlength="150"')}<div class="error" role="alert"></div><button class="btn primary">รับ OTP</button></form>`,
    );
  }
  async function issueOtp(data, replaceId) {
    const result = await apiRequest("/api/otp/request", {
      method: "POST",
      body: JSON.stringify({
        purpose: data.purpose,
        portal: data.purpose === "reset" ? "auto" : data.portal,
        channel: data.channel,
        contact: data.contact,
        draft: data.draft,
        replaceChallengeId: replaceId,
      }),
    });
    for (const [id, c] of otpChallenges)
      if (c.contact === data.contact) otpChallenges.delete(id);
    const { id: unused, ...safeData } = data;
    const challengeId = result.challengeId;
    otpChallenges.set(challengeId, {
      ...safeData,
      challengeId,
      expires: Date.parse(result.expiresAt),
      attempts: 0,
      resendAt: Date.parse(result.resendAt || 0),
      message: result.message,
    });
    currentChallenge = challengeId;
    otpModal(challengeId, result.code || "");
    return challengeId;
  }
  function otpModal(id, code) {
    const c = otpChallenges.get(id);
    if (registrationProvider === "password") {
      openModal(
        "ยืนยัน OTP",
        `<p>${esc(c.message || "หากอีเมลนี้มีบัญชี ระบบจะส่ง OTP ไปยังอีเมลที่สมัคร")}</p><p>อีเมล: <b>${esc(c.contact)}</b></p><p class="sub">ใช้ได้ครั้งเดียวภายใน 5 นาที · กรอกผิดได้ไม่เกิน 5 ครั้ง</p><form id="otp-form" data-id="${id}" class="space">${input("รหัส OTP 6 หลัก", "otp", "text", 'inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="one-time-code"')}<div class="error" role="alert"></div><div class="row"><button class="btn primary" type="submit">ยืนยัน OTP</button><button type="button" class="btn" data-action="otp-resend" data-id="${id}">ส่ง OTP อีกครั้ง</button></div></form><p class="sub" data-reset-expiry role="status"></p>`,
      );
      clearInterval(emailTimer);
      const tick = () => {
        const status = document.querySelector("[data-reset-expiry]");
        const resend = document.querySelector('[data-action="otp-resend"]');
        if (!status || !resend) {
          clearInterval(emailTimer);
          return;
        }
        const remaining = Math.max(
          0,
          Math.ceil((c.expires - Date.now()) / 1000),
        );
        status.textContent = remaining
          ? `OTP หมดอายุใน ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} นาที`
          : "OTP หมดอายุแล้ว กรุณาขอรหัสใหม่";
        const wait = Math.max(0, Math.ceil((c.resendAt - Date.now()) / 1000));
        resend.disabled = wait > 0;
        resend.textContent = wait
          ? `ส่ง OTP อีกครั้ง (${wait} วินาที)`
          : "ส่ง OTP อีกครั้ง";
      };
      tick();
      emailTimer = setInterval(tick, 1000);
      return;
    }
    openModal(
      "ยืนยัน OTP",
      `${c.purpose === "register" ? '<p class="muted">ขั้นตอน 2 / 3 · ยืนยันช่องทางติดต่อก่อนตั้งรหัสผ่าน</p>' : ""}<p>ช่องทาง: <b>${c.channel === "email" ? "อีเมล" : "เบอร์โทรศัพท์"}</b> · ${esc(c.contact)}</p><div class="otp-inbox"><div class="eyebrow">กล่องรับ OTP จำลอง • ไม่ได้ส่งจริง</div><strong>${esc(code)}</strong><p>ใช้ได้ครั้งเดียวภายใน 5 นาที · กรอกผิดได้ไม่เกิน 5 ครั้ง</p></div><form id="otp-form" data-id="${id}" class="space">${input("รหัส OTP 6 หลัก", "otp", "text", 'inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="one-time-code"')}<div class="error" role="alert"></div><div class="row"><button class="btn primary">ยืนยัน OTP</button><button type="button" class="btn" data-action="otp-resend" data-id="${id}">ขอ OTP ใหม่ (เว้น 60 วินาที)</button></div></form>`,
    );
  }
  function ratingModal(id) {
    const r = store.registrations.find(
      (r) => r.id === id && r.userId === state.userId,
    );
    if (!member() || !r) return;
    openModal(
      "ประเมินความรู้สึกหลังใช้งาน",
      `<div class="badge APPROVED">ลงทะเบียนสำเร็จ</div><h3 class="space">ขั้นตอนการลงทะเบียนเวิร์กช็อปครั้งนี้ สะดวกราบรื่นแค่ไหน?</h3><p class="muted">${esc(store.workshops.find((w) => w.id === r.workshopId).title)}</p><div class="emoji-ratings">${[
        [5, "😍", "ง่ายมาก"],
        [4, "🙂", "ราบรื่นดี"],
        [3, "😐", "พอใช้ได้"],
        [2, "🙁", "ติดขัด/ยุ่งยาก"],
        [1, "😣", "ยุ่งยากมาก"],
      ]
        .map(
          ([score, emoji, label]) =>
            `<button type="button" data-action="rate" data-id="${r.id}" data-score="${score}" aria-label="${label} ${score} จาก 5"><span>${emoji}</span>${label}</button>`,
        )
        .join(
          "",
        )}</div><button class="btn small space" data-action="close">ไว้ภายหลัง</button>`,
    );
  }

  function supportModal() {
    if (!member()) return;
    const u = user();
    openModal(
      "แจ้งปัญหา / ร้องเรียน",
      `<form id="support-form"><div class="field"><label for="issue">เลือกปัญหาที่พบ</label><select name="issue" id="issue">${issues.map((i) => `<option>${esc(i)}</option>`).join("")}</select></div><div class="grid two"><div class="field"><label for="type">ประเภทผู้ใช้</label><select id="type" name="type"><option ${u?.type === "นักศึกษา" ? "selected" : ""}>นักศึกษา</option><option ${u?.type === "อาจารย์" ? "selected" : ""}>อาจารย์</option></select></div>${input("รหัสประจำตัว", "code", "text", `maxlength="30" value="${esc(u?.code || "")}"`)}</div>${input("ชื่อ-นามสกุล", "name", "text", `maxlength="120" value="${esc(u?.name || "")}"`)}${input("อีเมล / เบอร์โทรศัพท์", "contact", "text", `maxlength="150" value="${esc(u?.email || u?.phone || "")}"`)}<div class="field"><label for="detail">รายละเอียดเพิ่มเติม (ไม่บังคับ)</label><textarea id="detail" name="detail" maxlength="3000" placeholder="อธิบายปัญหาที่พบ โดยไม่ระบุรหัสผ่าน"></textarea></div><div class="error" id="form-error" role="alert"></div><button class="btn primary">ส่งเรื่องร้องเรียน</button></form>`,
    );
  }
  function workshopModal(id) {
    if (!staff()) return;
    const w = store.workshops.find((w) => w.id === id);
    openModal(
      w ? "แก้ไขเวิร์กช็อป" : "เพิ่มเวิร์กช็อปใหม่",
      `<form id="workshop-form" data-id="${w?.id || ""}">${input("ชื่อกิจกรรม", "title", "text", `maxlength="180" value="${esc(w?.title || "")}"`)}<div class="grid two">${input("วันและเวลาเริ่ม", "start", "datetime-local", `value="${w?.start || ""}"`)}${input("วันและเวลาสิ้นสุด", "end", "datetime-local", `value="${w?.end || ""}"`)}</div>${input("สถานที่ / ห้องจัดเวิร์กช็อป", "place", "text", `maxlength="180" value="${esc(w?.place || "")}"`)}${input("จำนวนที่นั่ง", "capacity", "number", `min="1" max="10000" step="1" value="${w?.capacity || 30}"`)}${input("จำนวนชั่วโมงอบรม (หักเวลาพักแล้ว)", "hours", "number", `min="0.5" max="1000" step="0.5" value="${w?.hours || 3}"`)}<div class="field"><label for="cover">รูปภาพปก (JPG / PNG / WebP ไม่เกิน 3 MB)</label><input type="file" name="cover" id="cover" accept="image/jpeg,image/png,image/webp"></div><div class="field"><label for="description">คำอธิบายกิจกรรม</label><textarea name="description" id="description" maxlength="1000">${esc(w?.description || "")}</textarea></div><div class="error" id="form-error" role="alert"></div><button class="btn primary">บันทึกเวิร์กช็อป</button></form>`,
    );
  }
  const validContact = (c) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) || /^0\d{8,9}$/.test(c);
  const normalize = (c) => c.trim().toLowerCase();
  function enroll(id) {
    if (!member()) return;
    const w = store.workshops.find((w) => w.id === id);
    if (!w || phase(w) !== "upcoming" || occupancy(id) >= w.capacity)
      return toast("กิจกรรมปิดรับหรือที่นั่งเต็มแล้ว");
    if (apiSaveCount) return toast("กำลังบันทึกรายการก่อนหน้า กรุณารอสักครู่");
    const conflict = store.registrations.find((r) => {
      const event = store.workshops.find((x) => x.id === r.workshopId);
      return (
        r.workshopId !== id &&
        r.status !== "CANCELLED" &&
        event &&
        new Date(w.start) < new Date(event.end) &&
        new Date(event.start) < new Date(w.end)
      );
    });
    if (conflict)
      return toast(
        "เวลาตรงกับกิจกรรมที่ลงทะเบียนไว้แล้ว กรุณาตรวจสอบกิจกรรมของฉัน",
      );
    let r = store.registrations.find(
      (r) => r.workshopId === id && r.userId === state.userId,
    );
    if (r && r.status !== "CANCELLED")
      return toast("คุณลงทะเบียนกิจกรรมนี้แล้ว");
    const now = new Date().toISOString();
    if (r) {
      r.status = "PENDING";
      r.ratingEvent = r.id;
      r.updatedAt = now;
    } else {
      const registrationId = uid();
      r = {
        id: registrationId,
        userId: state.userId,
        workshopId: id,
        status: "PENDING",
        ratingEvent: registrationId,
        createdAt: now,
        updatedAt: now,
      };
      store.registrations.push(r);
    }
    closeModal();
    return commit("ลงทะเบียนสำเร็จ ตรวจสอบได้ที่กิจกรรมของฉัน");
  }
  function clearRecovery() {
    clearInterval(emailTimer);
    otpChallenges.clear();
    resetGrants.clear();
    currentChallenge = null;
  }
  let promoPointerStart = null;
  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest("[data-promo-swipe]")) promoPointerStart = e.clientX;
  });
  document.addEventListener("pointerup", (e) => {
    if (promoPointerStart === null) return;
    const delta = e.clientX - promoPointerStart;
    promoPointerStart = null;
    if (Math.abs(delta) < 45) return;
    const total = promotionItems().length;
    state.promoSlide =
      delta < 0
        ? (state.promoSlide + 1) % total
        : (state.promoSlide - 1 + total) % total;
    render();
  });
  document.addEventListener("pointercancel", () => {
    promoPointerStart = null;
  });
  document.addEventListener("focusin", (e) => {
    if (!e.target.closest(".account-menu")) closeAccountMenu();
    if (
      !e.target.closest('#workshop-actions-menu, [data-action="workshop-menu"]')
    )
      closeWorkshopMenu();
  });
  window.addEventListener?.("resize", () => closeWorkshopMenu());
  document.addEventListener(
    "scroll",
    (e) => {
      if (!e.target.closest?.("#workshop-actions-menu")) closeWorkshopMenu();
    },
    true,
  );
  document.addEventListener("click", async (e) => {
    if (!e.target.closest(".account-menu")) closeAccountMenu();
    if (
      !e.target.closest('#workshop-actions-menu, [data-action="workshop-menu"]')
    )
      closeWorkshopMenu();
    const b = e.target.closest("[data-action]");
    if (!b || b.disabled) return;
    let a = b.dataset.action;
    const id = b.dataset.id;
    if (a === "answer-yes" || a === "answer-no")
      return finishConfirm(a === "answer-yes");
    if (pendingConfirm) return;
    if (staff() && a === "attendance-pending") {
      participantWorkshop = id;
      state.page = "participants";
      state.participantQuery = "";
      state.participantStatus = "PENDING";
      return render();
    }
    if (staff() && a === "finalize-attendance") {
      if (apiSaveCount) return toast("กำลังบันทึกผล กรุณารอสักครู่");
      const w = store.workshops.find((w) => w.id === id);
      if (!w || w.attendanceFinalizedAt || +archiveDate(w.end) > Date.now())
        return;
      if (attendanceStats(w).pending)
        return toast("กรุณาบันทึกผลเข้าร่วมหรือไม่เข้าร่วมให้ครบทุกคนก่อน");
      if (
        !(await askConfirm(
          `ยืนยันผล “${w.title}” และเก็บเข้าประวัติหรือไม่? หลังยืนยันแล้วจะเป็นแบบอ่านอย่างเดียว`,
        ))
      )
        return;
      if (!staff() || apiSaveCount) return;
      const actor = state.userId,
        epoch = apiSaveEpoch;
      apiSaveCount++;
      render();
      try {
        const result = await apiRequest("/api/workshops/finalize-attendance", {
          method: "POST",
          body: JSON.stringify({ workshopId: id, revision: store.revision }),
        });
        if (actor !== state.userId || epoch !== apiSaveEpoch) return;
        Object.assign(store, result.store);
        overlayDemoImages();
        state.archiveWorkshop = id;
        state.archiveYear = archivePeriod(w).year;
        state.archiveMonth = String(archivePeriod(w).month);
        state.archiveParticipantQuery = "";
        state.archiveParticipantStatus = "all";
        state.archiveParticipantPage = 1;
        state.page = "archive";
        toast("ยืนยันผลและเก็บเข้าประวัติแล้ว");
      } catch (error) {
        if (actor !== state.userId || epoch !== apiSaveEpoch) return;
        toast(error.message);
        if (error.status === 409) {
          const latest = await apiRequest("/api/store").catch(() => null);
          if (latest && actor === state.userId && epoch === apiSaveEpoch) {
            Object.assign(store, latest.store);
            overlayDemoImages();
          }
        }
      } finally {
        apiSaveCount--;
        if (actor === state.userId && epoch === apiSaveEpoch) render();
      }
      return;
    }
    if (staff() && state.page === "archive" && a.startsWith("archive-")) {
      const w = archivedWorkshops().find(
        (w) => w.id === (id || state.archiveWorkshop),
      );
      if (a === "archive-roster" && w) {
        state.archiveWorkshop = w.id;
        state.archiveParticipantQuery = "";
        state.archiveParticipantStatus = "all";
        state.archiveParticipantPage = 1;
        return render();
      }
      if (a === "archive-back") {
        state.archiveWorkshop = null;
        return render();
      }
      if (a === "archive-detail" && w)
        return openModal(
          esc(w.title),
          `<p class="activity-description">${esc(w.description || "ยังไม่มีรายละเอียดเพิ่มเติม")}</p><p>${esc(archiveDateLabel(w.start))} – ${esc(archiveDateLabel(w.end))}</p><p class="muted">${esc(w.place || "ไม่ระบุสถานที่")} · ${number(w.hours || 0)} ชั่วโมง</p><button class="btn" data-action="close">ปิดรายละเอียด</button>`,
        );
      if (a === "archive-page") {
        state[
          state.archiveWorkshop ? "archiveParticipantPage" : "archivePage"
        ] = Math.max(1, Number(id) || 1);
        render();
        document
          .querySelector(".archive-view table")
          ?.scrollIntoView?.({ block: "start", behavior: "auto" });
        document.querySelector(".archive-view h1")?.focus?.();
        return;
      }
      if (a === "archive-clear") {
        state.archiveMonth = "all";
        state.archiveQuery = "";
        state.archivePage = 1;
        render();
        return archiveReplaceRoute();
      }
      if (a === "archive-export" && w) {
        // Keep spreadsheet formulas inert even if a member's display name starts with '='.
        const safe = (value) =>
          /^[\s]*[=+@-]/.test(String(value || "")) ? "'" + value : value;
        const period = archivePeriod(w);
        return downloadCsv(
          `bsru-archive-${period.year + 543}-${String(period.month).padStart(2, "0")}-${w.id.replace(/[^a-zA-Z0-9_-]/g, "")}.csv`,
          [
            [
              "ชื่อ–นามสกุล",
              "รหัสประจำตัว",
              "อีเมล",
              "เวิร์กช็อป",
              "วันที่เริ่มกิจกรรม",
              "ปี พ.ศ.",
              "เดือนที่จัดกิจกรรม",
              "สถานะการเข้าร่วม",
            ],
            ...archiveRegistrations(w.id).map((r) => {
              const u = store.users.find((u) => u.id === r.userId);
              return [
                u?.name || "ไม่พบข้อมูลผู้ใช้งาน",
                u?.code || "",
                u?.email || "",
                w.title,
                archiveDateLabel(w.start),
                period.year + 543,
                archiveMonths[period.month - 1],
                labels[r.status] || r.status,
              ].map(safe);
            }),
          ],
        );
      }
      return;
    }
    if (b.closest("#workshop-actions-menu")) closeWorkshopMenu(true);
    if (staff() && a === "workshop-menu") return openWorkshopMenu(b);
    if (staff() && state.page === "manage") {
      if (a === "manage-view") {
        state.manageView = id === "deleted" ? "deleted" : "current";
        state.filter = "all";
        state.search = "";
        state.dateFrom = "";
        state.dateTo = "";
        state.managePage = 1;
        state.manageSort = "priority";
        render();
        $(
          `[data-action="manage-view"][data-id="${state.manageView}"]`,
        )?.focus();
        return;
      }
      if (a === "manage-page") {
        state.managePage = Math.max(1, Number(id) || 1);
        render();
        $("#manage-results")?.focus({ preventScroll: true });
        $("#manage-results")?.scrollIntoView?.({
          block: "start",
          behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        });
        return;
      }
      if (a === "reset-manage-filters" || a === "clear-manage-dates") {
        state.dateFrom = "";
        state.dateTo = "";
        state.managePage = 1;
        if (a === "reset-manage-filters") {
          state.search = "";
          state.filter = "all";
        }
        return render();
      }
    }
    if (a === "retry-bootstrap") return initializeLocalApp();
    if (a === "toggle-account-menu") {
      const dropdown = $("#account-dropdown");
      dropdown.hidden = !dropdown.hidden;
      b.setAttribute("aria-expanded", String(!dropdown.hidden));
      return;
    }
    if (b.closest("#account-dropdown")) closeAccountMenu(true);
    if (a === "account-profile") return accountModal();
    if (a === "account-settings") return accountModal(true);
    if (a === "account-password") {
      if (!user()) return;
      if (!otpAvailable && !passwordResetAvailable)
        return openModal(
          "ความปลอดภัยบัญชี",
          '<div class="notice">ยังไม่ได้เปิดบริการเปลี่ยนรหัสผ่านทางอีเมล กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน</div><p class="muted">เมื่อเปิดบริการแล้ว ระบบจะส่ง OTP ไปยังอีเมลที่ผูกกับบัญชีเพื่อยืนยันก่อนตั้งรหัสผ่านใหม่</p><button type="button" class="btn" data-action="close">รับทราบ</button>',
        );
      clearRecovery();
      return forgotModal();
    }
    if (a === "notification-go") {
      closeModal();
      state.page = id === "my-complaints" ? "my-complaints" : "reports";
      return render();
    }
    if (a === "mine-status") {
      state.mineStatus = id;
      return render();
    }
    if (a === "notification-read") return readNotification(id);
    if (a === "notification-filter" && member()) {
      state.notificationFilter = ["general", "activity"].includes(id)
        ? id
        : "general";
      return render();
    }
    if (a === "clear-notification-search") {
      state.notificationQuery = "";
      return render();
    }
    if (a === "export-participants" && staff()) {
      const query = state.participantQuery.toLowerCase();
      const rows = store.registrations
        .filter((r) => {
          const u = store.users.find((x) => x.id === r.userId);
          return (
            (participantWorkshop === "all" ||
              r.workshopId === participantWorkshop) &&
            (state.participantStatus === "all" ||
              r.status === state.participantStatus) &&
            (!query ||
              `${u?.name || ""} ${u?.code || ""} ${u?.email || ""}`
                .toLowerCase()
                .includes(query))
          );
        })
        .map((r) => {
          const u = store.users.find((x) => x.id === r.userId);
          const w = store.workshops.find((x) => x.id === r.workshopId);
          return [
            u?.name || "",
            u?.code || "",
            u?.email || "",
            w?.title || "",
            labels[r.status] || r.status,
          ];
        });
      downloadCsv("bsru-participants.csv", [
        ["ชื่อ", "รหัสประจำตัว", "อีเมล", "เวิร์กช็อป", "สถานะ"],
        ...rows,
      ]);
      return;
    }
    if (a === "reject" && staff()) {
      openModal(
        "ปฏิเสธผู้ใช้งาน",
        `<p class="muted">กรุณาระบุเหตุผลเพื่อเก็บไว้เป็นหลักฐานและแจ้งผู้สมัคร</p><form id="reject-form" data-id="${id}" class="space"><div class="field"><label for="reject-reason">เหตุผลที่ปฏิเสธ</label><textarea id="reject-reason" name="reason" required minlength="3" maxlength="500" placeholder="เช่น ข้อมูลไม่ครบ หรือไม่พบข้อมูลในระบบมหาวิทยาลัย"></textarea></div><div class="error" role="alert"></div><div class="row"><button type="button" class="btn" data-action="close">ยกเลิก</button><button class="btn danger">ยืนยันการปฏิเสธ</button></div></form>`,
      );
      return;
    }
    if (a === "notification-go" && member()) {
      closeModal();
      state.page = id;
      return render();
    }
    if (a === "reply-open") return replyModal(id);
    if (["logout", "switch", "approve", "attend", "absent"].includes(a)) {
      if (["approve", "attend", "absent"].includes(a) && !staff()) return;
      if (["logout", "switch"].includes(a) && !user()) {
      } else
        return confirmModal(
          {
            logout: "ต้องการออกจากระบบจริงใช่ไหม?",
            switch:
              "ต้องการออกจากบัญชีนี้เพื่อเข้าสู่ระบบด้วยบัญชีอื่นใช่หรือไม่?",
            approve: "ต้องการอนุมัติสิทธิ์ผู้ใช้งานนี้จริงใช่ไหม?",
            attend:
              "ต้องการยืนยันว่าผู้ใช้นี้เข้าร่วมงานและบันทึกชั่วโมงอบรมจริงใช่ไหม?",
            absent:
              "ต้องการบันทึกว่าผู้ใช้นี้ไม่ได้เข้าร่วมงานจริงใช่ไหม? ชั่วโมงของรายการนี้จะไม่นับรวม",
          }[a],
          "confirmed-" + a,
          id || "",
        );
    }
    if (a.startsWith("confirmed-")) {
      const next = a.slice(10);
      if (!["logout", "switch", "approve", "attend", "absent"].includes(next))
        return;
      a = next;
      closeModal();
    }
    if (a === "toggle-password") {
      const field = document.getElementById(id);
      if (!field) return;
      const show = field.type === "password";
      field.type = show ? "text" : "password";
      b.setAttribute("aria-pressed", String(show));
      b.setAttribute("aria-label", show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน");
      b.innerHTML = `<i class="fa-regular ${show ? "fa-eye-slash" : "fa-eye"}"></i><span>${show ? "ซ่อน" : "แสดง"}</span>`;
      return;
    }
    if (a === "close") {
      clearRecovery();
      return closeModal();
    }
    if (a === "switch") {
      clearRecovery();
      apiSaveEpoch++;
      if (apiCsrf)
        try {
          await apiRequest("/api/logout", { method: "POST", body: "{}" });
        } catch (err) {
          toast(err.message);
        }
      apiCsrf = null;
      state = {
        ...state,
        portal: "user",
        userId: null,
        page: "dashboard",
        view: "open",
      };
      closeModal();
      return render();
    }
    if (a === "logout") {
      clearRecovery();
      apiSaveEpoch++;
      if (apiCsrf)
        try {
          await apiRequest("/api/logout", { method: "POST", body: "{}" });
        } catch (err) {
          toast(err.message);
        }
      apiCsrf = null;
      state.userId = null;
      state.portal = "user";
      closeModal();
      return render();
    }
    if (a === "workshop-detail") return workshopDetail(id);
    if (a === "page") {
      state.page = id;
      if (id === "archive") state.archiveWorkshop = null;
      state.view = id === "mine" ? "mine" : "open";
      state.search = "";
      state.filter = "all";
      state.dateFrom = "";
      state.dateTo = "";
      state.managePage = 1;
      state.manageView = "current";
      if (id === "notifications") {
        state.notificationFilter = "general";
        state.notificationQuery = "";
      }
      return render();
    }
    if (a === "firebase-login") {
      const email = b.dataset.email;
      closeModal();
      const identity = document.querySelector('#login-form [name="identity"]');
      if (identity) identity.value = email;
      document.querySelector('#login-form [name="password"]')?.focus();
      return;
    }
    if (a === "registration-login") {
      clearInterval(emailTimer);
      closeModal();
      if (b.dataset.email) {
        const identity = document.querySelector(
          '#login-form [name="identity"]',
        );
        if (identity) identity.value = b.dataset.email;
        document.querySelector('#login-form [name="password"]')?.focus();
      }
      return;
    }
    if (a === "email-resend") return emailAction("resend");
    if (a === "email-edit") {
      const f = document.querySelector("#email-edit-form");
      f.hidden = false;
      f.querySelector("input").focus();
      return;
    }
    if (a === "register") return registerModal();
    if (a === "support" && member()) return supportModal();
    if (a === "forgot" || a === "change-password") {
      clearRecovery();
      return forgotModal();
    }
    if (a === "otp-resend") {
      const c = otpChallenges.get(id);
      if (!c || c.portal !== state.portal)
        return toast("กรุณาเริ่มขอ OTP ใหม่");
      try {
        if (registrationProvider === "password") {
          if (c.resendAt > Date.now()) return;
          b.disabled = true;
          b.textContent = "กำลังส่ง OTP…";
          await issueOtp(c, id);
          return;
        }
        if (
          !(await askConfirm(
            "ต้องการขอ OTP ใหม่จริงใช่ไหม? รหัสเดิมจะถูกยกเลิก",
          ))
        )
          return;
        await issueOtp(c, id);
      } catch (err) {
        b.disabled = false;
        b.textContent = "ส่ง OTP อีกครั้ง";
        toast(err.message);
      }
      return;
    }
    if (a === "slide") {
      state.slide =
        id === "prev"
          ? (state.slide - 1 + store.workshops.length) % store.workshops.length
          : id === "next"
            ? (state.slide + 1) % store.workshops.length
            : Number(id);
      return render();
    }
    if (a === "promo-slide") {
      const total = promotionItems().length;
      state.promoSlide =
        id === "prev"
          ? (state.promoSlide - 1 + total) % total
          : id === "next"
            ? (state.promoSlide + 1) % total
            : Number(id);
      return render();
    }
    if (a === "dashboard-month-info" && staff())
      return toast(
        `${b.dataset.label}: ${number(Number(b.dataset.count))} รายการลงทะเบียน`,
      );
    if (a === "view") {
      state.view = id;
      state.page = id === "mine" ? "mine" : "workshops";
      return render();
    }
    if (a === "rate-open" && member()) return ratingModal(id);
    if (a === "rate" && member()) {
      if (!(await askConfirm("ต้องการส่งคะแนนประเมินนี้จริงใช่ไหม?"))) return;
      const r = store.registrations.find(
          (r) => r.id === id && r.userId === state.userId,
        ),
        score = Number(b.dataset.score);
      if (!r || !Number.isInteger(score) || score < 1 || score > 5) return;
      const old = store.ratings.find(
        (x) => x.registrationId === r.id || x.eventId === r.ratingEvent,
      );
      if (old) {
        old.score = score;
        old.eventId = r.id;
        old.registrationId = r.id;
      } else
        store.ratings.push({
          id: uid(),
          eventId: r.id,
          userId: state.userId,
          registrationId: id,
          workshopId: r.workshopId,
          score,
          createdAt: new Date().toISOString(),
        });
      closeModal();
      return commit("ขอบคุณสำหรับการประเมินความรู้สึกหลังใช้งาน");
    }
    if (a === "enroll" && member()) {
      const r = store.registrations.find(
        (r) => r.userId === state.userId && r.workshopId === id,
      );
      return confirmModal(
        r
          ? "ต้องการลงทะเบียนเวิร์กช็อปนี้อีกครั้งหรือไม่?"
          : "ยืนยันการลงทะเบียนเวิร์กช็อปนี้หรือไม่?",
        "confirm-enroll",
        id,
      );
    }
    if (a === "confirm-enroll") return enroll(id);
    if (a === "cancel" && member())
      return confirmModal(
        "ต้องการยกเลิกการลงทะเบียนนี้หรือไม่?",
        "confirm-cancel",
        id,
      );
    if (a === "confirm-cancel" && member()) {
      const r = store.registrations.find(
        (r) => r.id === id && r.userId === state.userId,
      );
      if (r?.status !== "PENDING")
        return toast("สถานะเปลี่ยนแล้ว กรุณาตรวจสอบอีกครั้ง");
      r.status = "CANCELLED";
      r.updatedAt = new Date().toISOString();
      closeModal();
      return commit("ยกเลิกการลงทะเบียนแล้ว");
    }
    if (!staff()) return;
    if (a === "deleted-workshop-detail") return deletedWorkshopDetail(id);
    if (a === "delete-workshop") {
      const w = store.workshops.find((w) => w.id === id);
      if (!w) return toast("ไม่พบเวิร์กช็อป");
      openModal(
        "ลบเวิร์กช็อป",
        `<p>ต้องการลบเวิร์กช็อป “${esc(w.title)}” หรือไม่?</p><p class="notice">รายชื่อผู้ลงทะเบียน ผลประเมิน และชั่วโมงอบรมของกิจกรรมนี้จะถูกลบถาวร และไม่สามารถกู้คืนได้</p><p class="sub">ระบบจะเก็บชื่อกิจกรรม วันจัด และผู้ลบไว้ใน “กิจกรรมที่ลบไปแล้ว” สำหรับแอดมิน</p><div class="row" style="justify-content:flex-end"><button class="btn" data-action="close">ยกเลิก</button><button class="btn danger" data-action="confirm-delete-workshop" data-id="${esc(id)}">ยืนยันลบ</button></div>`,
      );
      return;
    }
    if (a === "confirm-delete-workshop") {
      if (b.disabled) return;
      const buttons = [...document.querySelectorAll("#modal-root button")];
      buttons.forEach((button) => (button.disabled = true));
      b.textContent = "กำลังลบ…";
      const actor = state.userId,
        epoch = apiSaveEpoch;
      apiSaveCount++;
      try {
        await apiSaving;
        if (actor !== state.userId || epoch !== apiSaveEpoch) return;
        updateSync("กำลังลบเวิร์กช็อป…");
        const result = await apiRequest("/api/workshops/delete", {
          method: "POST",
          body: JSON.stringify({ workshopId: id, revision: store.revision }),
        });
        if (actor !== state.userId || epoch !== apiSaveEpoch) return;
        Object.assign(store, result.store);
        overlayDemoImages();
        closeModal();
        render();
        updateSync("บันทึกแล้ว");
        toast("ลบเวิร์กช็อปแล้ว");
      } catch (error) {
        if (actor !== state.userId || epoch !== apiSaveEpoch) return;
        updateSync("ลบไม่สำเร็จ");
        toast(error.message);
        if (error.status === 409) {
          const latest = await apiRequest("/api/store").catch(() => null);
          if (latest && actor === state.userId && epoch === apiSaveEpoch) {
            Object.assign(store, latest.store);
            overlayDemoImages();
            closeModal();
            render();
          }
        }
      } finally {
        apiSaveCount--;
        buttons.forEach((button) => (button.disabled = false));
        b.textContent = "ยืนยันลบ";
      }
      return;
    }
    if (a === "close-workshop") {
      const w = store.workshops.find((w) => w.id === id);
      if (!w || w.closed || scheduledPhase(w) === "finished")
        return toast("ไม่สามารถปิดเวิร์กช็อปที่เสร็จสิ้นหรือปิดไปแล้ว");
      return confirmModal(
        "ปิดเวิร์กช็อปนี้หรือไม่? จะหยุดรับลงทะเบียนใหม่ และคงรายชื่อกับชั่วโมงที่ยืนยันไว้เดิม",
        "confirm-close-workshop",
        id,
      );
    }
    if (a === "confirm-close-workshop") {
      const w = store.workshops.find((w) => w.id === id);
      if (!w || w.closed || scheduledPhase(w) === "finished")
        return toast("ไม่สามารถปิดเวิร์กช็อปที่เสร็จสิ้นหรือปิดไปแล้ว");
      w.closed = true;
      w.closedAt = new Date().toISOString();

      closeModal();
      return commit("ปิดเวิร์กช็อปแล้ว ฝั่งผู้ใช้ไม่สามารถลงทะเบียนเพิ่มได้");
    }
    if (a === "add-workshop") return workshopModal();
    if (a === "edit-workshop") {
      if (store.workshops.find((w) => w.id === id)?.attendanceFinalizedAt)
        return toast("กิจกรรมนี้ยืนยันผลแล้ว ไม่สามารถแก้ไขได้");
      return workshopModal(id);
    }
    if (a === "participants-for") {
      participantWorkshop = id;
      state.page = "participants";
      state.participantQuery = "";
      state.participantStatus = "all";
      return render();
    }
    if (a === "approve") {
      const u = store.users.find((u) => u.id === id && u.role === "user");
      if (u?.status === "WAITING") {
        u.status = "APPROVED";

        notifyUser(
          u.id,
          "บัญชีของคุณได้รับอนุมัติแล้ว",
          "คุณสามารถเข้าสู่ระบบและลงทะเบียนเวิร์กช็อปได้แล้ว",
          "account",
          u.id,
        );
        commit("อนุมัติแล้ว ผู้ใช้เข้าสู่ระบบได้ทันที");
      }
      return;
    }

    const r = store.registrations.find((r) => r.id === id);
    if (!r || r.status === "CANCELLED") return;
    if (
      store.workshops.find((w) => w.id === r.workshopId)?.attendanceFinalizedAt
    )
      return toast("กิจกรรมนี้ยืนยันผลแล้ว ไม่สามารถแก้ไขผลได้");
    const previous = r.status;
    if (
      ["ATTENDED", "ABSENT"].includes(previous) &&
      ((a === "attend" && previous !== "ATTENDED") ||
        (a === "absent" && previous !== "ABSENT"))
    ) {
      if (
        !(await askConfirm(
          "เปลี่ยนผลการเข้าร่วมที่บันทึกไว้แล้วหรือไม่? ชั่วโมงสะสมจะเปลี่ยนตามผลใหม่",
        ))
      )
        return;
      if (r.status !== previous || !staff()) return;
    }
    if (a === "attend") r.status = "ATTENDED";
    else if (a === "absent") r.status = "ABSENT";
    else return;
    if (previous !== r.status) {
      const w = store.workshops.find((w) => w.id === r.workshopId);
      notifyUser(
        r.userId,
        a === "attend"
          ? "ยืนยันการเข้าร่วมงานแล้ว"
          : "อัปเดตสถานะการเข้าร่วมงาน",
        `${w.title} · ${labels[r.status]} · ชั่วโมงที่ได้รับ ${number(hoursOf(r))} ชั่วโมง`,
        "attendance",
        r.id,
      );
    }
    r.updatedAt = new Date().toISOString();

    commit("อัปเดตสถานะและชั่วโมงอบรมของผู้ใช้งานแล้ว");
  });
  document.addEventListener(
    "toggle",
    (e) => {
      if (e.target.id === "staff-upcoming-details")
        state.dashboardAgendaOpen = e.target.open;
    },
    true,
  );
  document.addEventListener("change", (e) => {
    if (e.target.id === "dashboard-period" && staff()) {
      state.dashboardMonths = Number(e.target.value) === 12 ? 12 : 6;
      render();
      $("#dashboard-period")?.focus();
      return;
    }
    if (staff() && state.page === "archive") {
      if (e.target.id === "archive-year") {
        state.archiveYear = Number(e.target.value);
        state.archiveMonth = "all";
        state.archivePage = 1;
        render();
        return archiveReplaceRoute();
      }
      if (e.target.id === "archive-month") {
        state.archiveMonth = e.target.value;
        state.archivePage = 1;
        render();
        return archiveReplaceRoute();
      }
      if (e.target.id === "archive-participant-status") {
        state.archiveParticipantStatus = e.target.value;
        state.archiveParticipantPage = 1;
        return render();
      }
    }
    if (["date-from", "date-to"].includes(e.target.id)) {
      state[e.target.id === "date-from" ? "dateFrom" : "dateTo"] =
        e.target.value;
      state.managePage = 1;
      render();
    }
    if (e.target.id === "phase-filter") {
      state.filter = e.target.value;
      state.managePage = 1;
      render();
    }
    if (e.target.id === "manage-sort" && staff()) {
      state.manageSort = ["priority", "newest", "oldest"].includes(
        e.target.value,
      )
        ? e.target.value
        : "priority";
      state.managePage = 1;
      render();
    }
    if (e.target.id === "manage-page-size" && staff()) {
      const size = Number(e.target.value);
      state.managePageSize = [10, 25, 50].includes(size) ? size : 10;
      state.managePage = 1;
      render();
    }
    if (e.target.id === "participant-filter") {
      participantWorkshop = e.target.value;
      render();
    }
    if (e.target.id === "approval-status") {
      state.approvalStatus = e.target.value;
      render();
    }
    if (e.target.id === "participant-status") {
      state.participantStatus = e.target.value;
      render();
    }
    if (e.target.id === "faculty") {
      const list = PROGRAMS[e.target.value] || [];
      $("#major").innerHTML =
        '<option value="">เลือกสาขา / หลักสูตร</option>' +
        list.map((x) => `<option>${esc(x)}</option>`).join("");
      $("#major").disabled = !list.length;
    }
    if (e.target.id === "recovery-channel") {
      const phone = e.target.value === "phone",
        field = $("#reset-contact");
      field.type = phone ? "tel" : "email";
      field.value = "";
      field.autocomplete = phone ? "tel" : "email";
      field.setAttribute("maxlength", phone ? "10" : "150");
      if (phone) field.setAttribute("pattern", "0[0-9]{8,9}");
      else field.removeAttribute("pattern");
      document.querySelector('label[for="reset-contact"]').textContent = phone
        ? "เบอร์โทรศัพท์ที่ผูกกับบัญชี"
        : "อีเมลที่ผูกกับบัญชี";
    }
  });
  document.addEventListener("input", (e) => {
    if (
      staff() &&
      state.page === "archive" &&
      ["archive-search", "archive-participant-search"].includes(e.target.id)
    ) {
      const field = e.target.id;
      const pos = e.target.selectionStart;
      state[
        field === "archive-search" ? "archiveQuery" : "archiveParticipantQuery"
      ] = e.target.value;
      state[
        field === "archive-search" ? "archivePage" : "archiveParticipantPage"
      ] = 1;
      render();
      document.getElementById(field)?.focus();
      document.getElementById(field)?.setSelectionRange?.(pos, pos);
      return;
    }
    if (e.target.id === "search") {
      const pos = e.target.selectionStart;
      state.search = e.target.value;
      state.managePage = 1;
      render();
      $("#search").focus();
      $("#search").setSelectionRange?.(pos, pos);
    }
    if (e.target.id === "notification-search") {
      const pos = e.target.selectionStart;
      state.notificationQuery = e.target.value;
      render();
      const search = $("#notification-search");
      search?.focus();
      search?.setSelectionRange(pos, pos);
    }
    if (["approval-search", "participant-search"].includes(e.target.id)) {
      const pos = e.target.selectionStart;
      if (e.target.id === "approval-search")
        state.approvalQuery = e.target.value;
      else state.participantQuery = e.target.value;
      render();
      const search = document.getElementById(e.target.id);
      search?.focus();
      search?.setSelectionRange(pos, pos);
    }
    if (
      [
        "new-password",
        "reset-password",
        "confirm-password",
        "reset-confirm",
      ].includes(e.target.id)
    ) {
      const p = $("#new-password") || $("#reset-password"),
        confirm = $("#confirm-password") || $("#reset-confirm"),
        hint = $("#password-strength");
      if (p && hint) {
        const msg = passwordError(p.value, confirm?.value || p.value);
        hint.textContent = p.value ? msg || "✓ รหัสผ่านผ่านเกณฑ์และตรงกัน" : "";
        hint.style.color = msg ? "var(--red)" : "var(--green)";
      }
    }
  });
  document.addEventListener("keydown", (e) => {
    const workshopMenu = $("#workshop-actions-menu");
    if (workshopMenu) {
      if (e.key === "Escape" || e.key === "Tab") {
        if (e.key === "Escape") e.preventDefault();
        closeWorkshopMenu(true);
        return;
      }
      if (
        ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) &&
        e.target.closest?.("#workshop-actions-menu")
      ) {
        e.preventDefault();
        const items = [...workshopMenu.querySelectorAll("button")];
        const index = items.indexOf(e.target);
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : (index + (e.key === "ArrowUp" ? -1 : 1) + items.length) %
                items.length;
        items[next]?.focus();
        return;
      }
    }
    const dropdown = $("#account-dropdown");
    const trigger = e.target.closest?.('[data-action="toggle-account-menu"]');
    if (dropdown && (trigger || !dropdown.hidden)) {
      if (e.key === "Escape" && !dropdown.hidden) {
        e.preventDefault();
        closeAccountMenu(true);
        return;
      }
      if (
        ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) &&
        e.target.closest?.(".account-menu")
      ) {
        e.preventDefault();
        dropdown.hidden = false;
        $('[data-action="toggle-account-menu"]').setAttribute(
          "aria-expanded",
          "true",
        );
        const items = [...dropdown.querySelectorAll("button")];
        const index = items.indexOf(e.target);
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : e.key === "ArrowUp"
                ? index < 0
                  ? items.length - 1
                  : (index - 1 + items.length) % items.length
                : (index + 1) % items.length;
        items[next]?.focus();
        return;
      }
    }
    if (pendingConfirm) {
      if (e.key === "Escape") {
        e.preventDefault();
        finishConfirm(false);
      } else if (e.key === "Tab") {
        const no = $('#confirm-root [data-action="answer-no"]'),
          yes = $('#confirm-root [data-action="answer-yes"]');
        e.preventDefault();
        (document.activeElement === no ? yes : no)?.focus();
      }
      return;
    }
    const dialog = $(".dialog");
    if (!dialog) return;
    if (e.key === "Escape") {
      clearRecovery();
      closeModal();
      return;
    }
    if (e.key === "Tab") {
      const f = [
        ...dialog.querySelectorAll("button,input,select,textarea"),
      ].filter((x) => !x.disabled);
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
        e.preventDefault();
        f[0].focus();
      }
    }
  });
  function validateDraft(d) {
    if (!d.name || !d.code || !["นักศึกษา", "อาจารย์"].includes(d.type))
      throw Error("กรุณากรอกชื่อ ประเภทผู้ใช้ และรหัสประจำตัวให้ครบ");
    if (!PROGRAMS[d.faculty]?.includes(d.major))
      throw Error("กรุณาเลือกคณะและสาขาที่ตรงกัน");
    if (!/^[a-z0-9._%+-]+@bsru\.ac\.th$/i.test(d.email || ""))
      throw Error(
        "สมัครได้เฉพาะอีเมลมหาวิทยาลัย @bsru.ac.th เท่านั้น ไม่รับอีเมลส่วนตัว",
      );
    if (!/^0\d{8,9}$/.test(d.phone || ""))
      throw Error("กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้องและครบถ้วน");
    if (
      store.users.some(
        (u) =>
          (d.email && normalize(u.email) === d.email) ||
          (d.phone && u.phone === d.phone) ||
          normalize(u.code) === normalize(d.code),
      )
    )
      throw Error("อีเมล เบอร์โทรศัพท์ หรือรหัสประจำตัวนี้มีผู้ใช้แล้ว");
  }
  document.addEventListener("submit", async (e) => {
    const form = e.target;
    if (!["firebase-resend-form", "firebase-reset-form"].includes(form.id))
      return;
    e.preventDefault();
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    const label = button.textContent;
    const error = form.querySelector(".error");
    error.textContent = "";
    button.disabled = true;
    button.textContent = "กำลังส่งลิงก์…";
    const data = Object.fromEntries(new FormData(form));
    try {
      const result = await apiRequest(
        "/api/firebase/" +
          (form.id === "firebase-reset-form" ? "password-reset" : "resend"),
        { method: "POST", body: JSON.stringify(data) },
      );
      if (form.id === "firebase-reset-form") {
        openModal(
          "ตรวจกล่องอีเมล",
          `<p role="status">${esc(result.message)}</p><button class="btn primary" data-action="registration-login">กลับไปเข้าสู่ระบบ</button>`,
        );
      } else firebaseLinkModal(data.email, result.verified === true);
    } catch (err) {
      error.textContent = err.message;
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });
  document.addEventListener("submit", async (e) => {
    const f = e.target;
    if (
      !["email-register-form", "email-otp-form", "email-edit-form"].includes(
        f.id,
      )
    )
      return;
    e.preventDefault();
    if (emailBusy) return;
    f.querySelectorAll("[data-error],.error").forEach(
      (el) => (el.textContent = ""),
    );
    f.querySelectorAll("[aria-invalid]").forEach((el) =>
      el.removeAttribute("aria-invalid"),
    );
    const d = Object.fromEntries(new FormData(f));
    if (f.id === "email-otp-form")
      return emailAction("verify", { code: String(d.otp || "").trim() });
    if (f.id === "email-edit-form")
      return emailAction("email", { email: d.email });
    emailBusy = true;
    const button = f.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent =
      registrationProvider === "password"
        ? "กำลังสมัครสมาชิก…"
        : registrationProvider === "firebase"
          ? "กำลังส่งลิงก์…"
          : "กำลังส่งรหัส…";
    try {
      const result = await apiRequest("/api/registration/request", {
        method: "POST",
        body: JSON.stringify(d),
      });
      if (registrationProvider === "password") {
        f.querySelector('[name="password"]').value = "";
        openModal(
          "สมัครสมาชิกสำเร็จ",
          `<p>เข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่ตั้งไว้ได้เลย</p><button class="btn primary" data-action="registration-login" data-email="${esc(result.email)}">ไปเข้าสู่ระบบ</button>`,
        );
        return;
      }
      if (registrationProvider === "firebase") {
        f.querySelector('[name="password"]').value = "";
        firebaseLinkModal(result.email, result.verified === true);
        return;
      }
      emailRegistration = result;
      saveEmailRegistration();
      emailBusy = false;
      emailOtpModal();
    } catch (error) {
      registrationFieldsError(f, error);
    } finally {
      emailBusy = false;
      button.disabled = !registrationAvailable;
      button.textContent = "สมัครสมาชิก";
    }
  });
  document.addEventListener("submit", async (e) => {
    const f = e.target;
    if (
      ![
        "login-form",
        "account-settings-form",
        "support-form",
        "workshop-form",
        "forgot-form",
        "otp-form",
        "reset-form",
        "reply-form",
        "reject-form",
      ].includes(f.id)
    )
      return;
    e.preventDefault();
    const formData = new FormData(f),
      d = Object.fromEntries(formData);
    for (const k of Object.keys(d))
      if (
        typeof d[k] === "string" &&
        ![
          "password",
          "new-password",
          "confirm-password",
          "reset-password",
          "reset-confirm",
        ].includes(k)
      )
        d[k] = d[k].trim();
    const submit = f.querySelector('button[type="submit"],button:not([type])');
    if (submit) submit.disabled = true;
    const err = f.querySelector(".error");
    if (err) err.textContent = "";
    const portalAtSubmit = state.portal,
      actorAtSubmit = state.userId;
    try {
      if (f.id === "account-settings-form") {
        const name = String(d["account-name"] || "").trim();
        const phone = String(d["account-phone"] || "").trim();
        if (!name || name.length > 120)
          throw Error("กรุณากรอกชื่อไม่เกิน 120 ตัวอักษร");
        if (phone && !/^0\d{8,9}$/.test(phone))
          throw Error("กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง");
        await apiSaving;
        if (state.userId !== actorAtSubmit) return;
        const result = await apiRequest("/api/account", {
          method: "POST",
          body: JSON.stringify({ name, phone }),
        });
        if (state.userId !== actorAtSubmit) return;
        Object.assign(store, result.store);
        overlayDemoImages();
        render();
        closeModal();
        toast("บันทึกข้อมูลบัญชีแล้ว");
        return;
      }
      if (f.id === "reply-form") {
        if (!staff()) throw Error("เฉพาะเจ้าหน้าที่เท่านั้น");
        const c = store.complaints.find((c) => c.id === f.dataset.id);
        if (
          !c ||
          !d.reply ||
          d.reply.length > 3000 ||
          !["REPLIED", "CLOSED"].includes(d.status)
        )
          throw Error("กรุณากรอกข้อความตอบกลับและเลือกสถานะให้ถูกต้อง");
        if (
          !(await askConfirm("ต้องการส่งคำตอบนี้กลับไปยังผู้ใช้งานจริงใช่ไหม?"))
        )
          return;
        if (!staff() || state.userId !== actorAtSubmit || !f.isConnected)
          return;
        const reply = {
          id: uid(),
          text: d.reply,
          staffName: user().name,
          staffId: state.userId,
          createdAt: new Date().toISOString(),
        };
        (c.replies ||= []).push(reply);
        c.status = d.status;
        c.updatedAt = reply.createdAt;

        notifyUser(
          c.userId,
          "เจ้าหน้าที่ตอบกลับคำร้องของคุณแล้ว",
          c.issue + " · " + d.reply,
          "complaint",
          c.id,
        );
        closeModal();
        commit("ส่งคำตอบแล้ว ผู้ใช้ได้รับแจ้งเตือนในแอป");
      }
      if (f.id === "reject-form") {
        if (!staff() || !d.reason || d.reason.length > 500)
          throw Error("กรุณาระบุเหตุผลการปฏิเสธไม่เกิน 500 ตัวอักษร");
        const target = store.users.find(
          (u) => u.id === f.dataset.id && u.role === "user",
        );
        if (!target || target.status !== "WAITING")
          throw Error("ผู้สมัครรายการนี้เปลี่ยนสถานะแล้ว");
        if (!(await askConfirm("ยืนยันการปฏิเสธผู้สมัครรายนี้ใช่หรือไม่?")))
          return;
        target.status = "REJECTED";

        notifyUser(
          target.id,
          "บัญชีผู้ใช้ยังไม่ได้รับการอนุมัติ",
          `เหตุผล: ${d.reason}`,
          "account",
          target.id,
        );
        closeModal();
        commit("ปฏิเสธผู้ใช้งานและบันทึกเหตุผลแล้ว");
      }
      if (f.id === "forgot-form") {
        if (!ready) throw Error("กำลังเตรียมระบบ กรุณารอสักครู่");
        if (registrationProvider === "password") d.channel = "email";
        if (!["email", "phone"].includes(d.channel))
          throw Error("กรุณาเลือกช่องทางรับ OTP");
        const contact =
          d.channel === "email"
            ? normalize(d["reset-contact"])
            : d["reset-contact"];
        if (
          d.channel === "email"
            ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)
            : !/^0\d{8,9}$/.test(contact)
        )
          throw Error("กรุณากรอกช่องทางติดต่อให้ถูกต้อง");
        if (
          registrationProvider !== "password" &&
          !(await askConfirm("ต้องการขอ OTP ผ่านช่องทางนี้จริงใช่ไหม?"))
        )
          return;
        await issueOtp({
          purpose: "reset",
          portal: portalAtSubmit,
          channel: d.channel,
          contact,
        });
      }
      if (f.id === "otp-form") {
        const c = otpChallenges.get(f.dataset.id);
        if (!c || c.portal !== state.portal || c.expires <= Date.now()) {
          otpChallenges.delete(f.dataset.id);
          throw Error("OTP หมดอายุหรือใช้ไปแล้ว กรุณาขอ OTP ใหม่");
        }
        if (!/^\d{6}$/.test(d.otp)) throw Error("กรุณากรอก OTP 6 หลัก");
        if (
          registrationProvider !== "password" &&
          !(await askConfirm("ต้องการยืนยัน OTP นี้และดำเนินการต่อจริงใช่ไหม?"))
        )
          return;
        if (
          c.portal !== state.portal ||
          !f.isConnected ||
          c.expires <= Date.now() ||
          !otpChallenges.has(f.dataset.id)
        )
          throw Error("OTP หมดอายุหรือการดำเนินการถูกยกเลิก กรุณาขอใหม่");
        const verified = await apiRequest("/api/otp/verify", {
          method: "POST",
          body: JSON.stringify({ challengeId: c.challengeId, code: d.otp }),
        });
        otpChallenges.delete(f.dataset.id);
        clearInterval(emailTimer);
        currentChallenge = null;
        {
          const grant = verified.grant;
          resetGrants.set(grant, {
            portal: c.portal,
            expires: Date.parse(verified.expiresAt),
          });
          openModal(
            "ตั้งรหัสผ่านใหม่",
            `<div class="notice">ยืนยัน OTP สำเร็จ กรุณาตั้งรหัสผ่านใหม่ภายใน 5 นาที</div><form id="reset-form" data-grant="${grant}" class="space">${passwordFields("reset-password", "reset-confirm")}<div class="error" role="alert"></div><button class="btn primary">บันทึกรหัสผ่านใหม่</button></form>`,
          );
        }
      }
      if (f.id === "reset-form") {
        const grant = resetGrants.get(f.dataset.grant);
        if (
          !grant ||
          grant.portal !== state.portal ||
          grant.expires <= Date.now()
        )
          throw Error("สิทธิ์ตั้งรหัสผ่านหมดอายุ กรุณาขอ OTP ใหม่");
        const password = d["reset-password"],
          problem = passwordError(password, d["reset-confirm"]);
        if (problem) throw Error(problem);
        if (
          registrationProvider !== "password" &&
          !(await askConfirm("ต้องการบันทึกรหัสผ่านใหม่นี้จริงใช่ไหม?"))
        )
          return;
        if (
          !f.isConnected ||
          state.portal !== portalAtSubmit ||
          grant.expires <= Date.now()
        )
          return;
        await apiRequest("/api/password/reset", {
          method: "POST",
          body: JSON.stringify({
            grant: d.grant || f.dataset.grant,
            password,
            confirmation: d["reset-confirm"],
          }),
        });
        resetGrants.delete(f.dataset.grant);
        clearRecovery();
        closeModal();
        if (registrationProvider === "password") {
          apiSaveEpoch++;
          apiCsrf = null;
          state.userId = null;
          state.portal = "auto";
          render();
        }
        toast("ตั้งรหัสผ่านใหม่สำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่");
      }
      if (f.id === "login-form") {
        if (!ready) throw Error("กำลังเตรียมระบบ กรุณารอสักครู่");
        const logged = await apiRequest("/api/login", {
          method: "POST",
          body: JSON.stringify({
            identity: d.identity,
            password: d.password,
          }),
        });
        if (portalAtSubmit !== state.portal || !f.isConnected) return;
        apiCsrf = logged.csrf;
        startApiPolling();
        const source = store.workshops.map((w) => ({ ...w }));
        const loaded = await apiRequest("/api/store");
        Object.assign(store, loaded.store);
        window.__demoWorkshopSource = source;
        overlayDemoImages();
        state.portal = logged.user.role;
        state.userId = logged.user.id;
        state.page = requestedPage();
        state.view = "open";
        render();
        toast("เข้าสู่ระบบสำเร็จ");
      }
      if (f.id === "support-form") {
        if (!member()) throw Error("เฉพาะผู้ใช้งานที่เข้าสู่ระบบเท่านั้น");
        if (
          !issues.includes(d.issue) ||
          !validContact(d.contact) ||
          !d.name ||
          !d.code
        )
          throw Error("กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง");
        if (
          !(await askConfirm(
            "ต้องการส่งเรื่องร้องเรียนนี้ถึงเจ้าหน้าที่จริงใช่ไหม?",
          ))
        )
          return;
        if (!member() || state.userId !== actorAtSubmit || !f.isConnected)
          return;
        const complaint = {
          id: uid(),
          userId: state.userId,
          issue: d.issue,
          name: d.name,
          type: d.type,
          code: d.code,
          contact: d.contact,
          detail: d.detail,
          replies: [],
          status: "OPEN",
          createdAt: new Date().toISOString(),
        };
        store.complaints.push(complaint);
        notifyUser(
          state.userId,
          "ส่งคำร้องเรียนสำเร็จ",
          `รับเรื่อง “${d.issue}” แล้ว รอเจ้าหน้าที่ตอบกลับ คุณสามารถติดตามคำตอบในคำร้องของฉัน`,
          "complaint",
          complaint.id,
        );
        closeModal();
        commit("ส่งเรื่องถึงเจ้าหน้าที่แล้ว");
      }
      if (f.id === "workshop-form") {
        if (!staff()) throw Error("กรุณาเข้าสู่ระบบเจ้าหน้าที่");
        if (!d.title || !d.place) throw Error("กรุณากรอกชื่อกิจกรรมและสถานที่");
        const elapsed = (new Date(d.end) - new Date(d.start)) / 3600000;
        if (!Number.isFinite(elapsed) || elapsed <= 0)
          throw Error("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม");
        const capacity = Number(d.capacity),
          hours = Number(d.hours);
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000)
          throw Error("จำนวนที่นั่งต้องเป็นจำนวนเต็ม 1–10,000");
        if (
          !Number.isFinite(hours) ||
          hours < 0.5 ||
          hours > 1000 ||
          (hours * 2) % 1 !== 0 ||
          hours > elapsed
        )
          throw Error(
            "ชั่วโมงอบรมต้องเพิ่มทีละ 0.5 ชั่วโมง และไม่เกินช่วงเวลาเริ่ม–สิ้นสุด",
          );
        const existing = store.workshops.find((w) => w.id === f.dataset.id);
        if (existing && capacity < occupancy(existing.id))
          throw Error("จำนวนที่นั่งต้องไม่น้อยกว่าจำนวนผู้ลงทะเบียน");
        let cover = existing?.cover || PHOTOS.team;
        if (d.cover?.size) {
          if (
            d.cover.size > 3 * 1024 * 1024 ||
            !["image/jpeg", "image/png", "image/webp"].includes(d.cover.type)
          )
            throw Error("ใช้รูป JPG, PNG หรือ WebP ขนาดไม่เกิน 3 MB");
          cover = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(Error("อ่านรูปภาพไม่สำเร็จ"));
            reader.readAsDataURL(d.cover);
          });
        }
        if (!staff() || !f.isConnected)
          throw Error("สิทธิ์เจ้าหน้าที่เปลี่ยนไป กรุณาเข้าสู่ระบบใหม่");
        if (existing && capacity < occupancy(existing.id))
          throw Error("จำนวนที่นั่งต้องไม่น้อยกว่าจำนวนผู้ลงทะเบียน");
        if (
          !(await askConfirm(
            existing
              ? "ต้องการบันทึกการแก้ไขเวิร์กช็อปนี้จริงใช่ไหม?"
              : "ต้องการสร้างเวิร์กช็อปนี้จริงใช่ไหม?",
          ))
        )
          return;
        if (!staff() || state.userId !== actorAtSubmit || !f.isConnected)
          return;
        const w = {
          id: existing?.id || uid(),
          title: d.title,
          start: d.start,
          end: d.end,
          place: d.place,
          capacity,
          hours,
          cover,
          description: d.description,
          category: "BSRU WORKSHOP",
          icon: "fa-graduation-cap",
          closed: existing?.closed || false,
          photoSource: existing?.photoSource,
        };
        if (existing) Object.assign(existing, w);
        else store.workshops.unshift(w);
        closeModal();
        commit("บันทึกแล้ว · เวิร์กช็อปและชั่วโมงอัปเดตในฝั่งผู้ใช้งานทันที");
      }
    } catch (error) {
      if (f.id === "login-form" && error.code === "FIREBASE_EMAIL_UNVERIFIED") {
        f.querySelector('[name="password"]').value = "";
        firebaseLinkModal(d.identity);
      } else if (err?.isConnected) err.textContent = error.message;
      else toast(error.message);
    } finally {
      if (submit?.isConnected) submit.disabled = false;
    }
  });
  async function initializeLocalApp() {
    if (initializing) return;
    initializing = true;
    ready = false;
    bootstrapError = false;
    bootstrapStage = "session";
    render();
    try {
      const session = await apiRequest("/api/session");
      otpAvailable = session.otpAvailable === true;
      registrationAvailable = session.registrationAvailable === true;
      registrationProvider = session.registrationProvider || "password";
      passwordResetAvailable = session.passwordResetAvailable === true;
      if (registrationProvider === "firebase") otpAvailable = false;
      updateSync("เชื่อมต่อแล้ว");
      if (session.user) {
        bootstrapStage = "data";
        render();
        const source = store.workshops.map((w) => ({ ...w }));
        const loaded = await apiRequest("/api/store");
        Object.assign(store, loaded.store);
        window.__demoWorkshopSource = source;
        overlayDemoImages();
        state.userId = session.user.id;
        state.portal = session.user.role;
        state.page = requestedPage();
        state.view = state.page === "mine" ? "mine" : "open";
        apiCsrf = session.csrf;
      } else {
        apiCsrf = null;
        state.userId = null;
      }
      ready = true;
      render();
      if (session.user) startApiPolling();
      else await restoreEmailRegistration();
    } catch (error) {
      apiCsrf = null;
      state.userId = null;
      // Only an explicit authentication failure should show the login screen.
      // Network/server errors keep the neutral screen with a retry action.
      ready = error.status === 401;
      bootstrapError = !ready;
      render();
      if (ready) toast("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
    } finally {
      initializing = false;
    }
  }
  initializeLocalApp();
})();
