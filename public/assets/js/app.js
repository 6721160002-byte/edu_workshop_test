"use strict";
/* Original BSRU Workshop interface, connected to the local Node.js API. */
(() => {
  let apiCsrf = null,
    apiSaving = Promise.resolve(),
    apiSaveCount = 0,
    apiSaveEpoch = 0,
    apiPollTimer = null;
  let otpAvailable = false;
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
        { status: response.status },
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
        document.querySelector("#modal-root .dialog")
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
      portal: null,
      userId: null,
      page: "dashboard",
      view: "open",
      search: "",
      filter: "all",
      period: "all",
      slide: 0,
      notificationFilter: "general",
      notificationQuery: "",
      promoSlide: 0,
      approvalQuery: "",
      approvalStatus: "WAITING",
      participantQuery: "",
      participantStatus: "all",
    },
    ready = false,
    modalReturn = null,
    toastTimer;
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
    return `<a class="skip-link" href="#main-content">ข้ามไปยังเนื้อหา</a><div class="app-frame ${u ? "is-authenticated" : "is-public"} ${!u && !state.portal ? "is-role-selection" : ""}">
      <header class="nav"><div class="wrap navin">
        <div class="brand"><div class="brandmark app-logo"><img src="${LOGO}" alt="BSRU Workshop"></div><div class="brand-copy"><b class="brand-title">BSRU <span>Workshop<span class="brand-dot">.</span></span></b><div class="brand-subtitle">ระบบจัดการอบรมและเวิร์กช็อป</div><div class="brand-institution">มหาวิทยาลัยราชภัฏบ้านสมเด็จเจ้าพระยา</div></div></div>
        ${u ? `<div class="workspace-label">พื้นที่ทำงาน <span>/</span> <b>${esc(active)}</b></div>` : '<span class="header-motto"><span class="status-dot"></span> เรียนรู้วันนี้ เติบโตได้ทุกวัน</span>'}
        <div class="header-actions">${u ? `<span class="role-pill ${a || state.portal === "staff" ? "staff-role" : ""}"><i class="fa-solid ${state.portal === "staff" ? "fa-shield-halved" : "fa-graduation-cap"}" aria-hidden="true"></i>${state.portal === "staff" ? "เจ้าหน้าที่" : "ผู้เรียน"}</span>` : ""}
        ${!u && state.portal ? '<button class="btn small" data-action="switch">← เลือกกลุ่มผู้ใช้งานใหม่</button>' : ""}
        ${member() ? `<button class="btn icon-button" data-action="page" data-id="notifications" aria-label="การแจ้งเตือน ${unread} รายการที่ยังไม่อ่าน"><i class="fa-regular fa-bell" aria-hidden="true"></i>${unread ? '<span class="notification-dot"></span>' : ""}</button>` : ""}
        ${u ? `<span class="header-avatar" aria-label="${esc(u.name)}">${esc(Array.from(u.name)[0])}</span><button class="btn icon-button mobile-action" data-action="logout" aria-label="ออกจากระบบ"><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i></button>` : ""}</div>
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
  function loginPromo(a) {
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
    return `<div class="login-promo" data-promo-swipe="true" aria-label="ประชาสัมพันธ์เวิร์กช็อป เลื่อนเพื่อดูรายการอื่น"><img class="login-promo-image" src="${esc(item.cover || PHOTOS.team)}" alt="${esc(item.title)}" draggable="false"><div class="login-promo-shade"></div><div class="login-promo-content"><div class="login-promo-top"><span class="login-promo-kicker">${fallback ? "BSRU WORKSHOP" : "UPCOMING WORKSHOP"}</span><span class="login-promo-count">${index + 1} / ${items.length}</span></div><img class="login-promo-logo" src="${LOGO}" alt="ตรา BSRU"><div class="login-promo-copy"><h1>${esc(item.title)}</h1><p>${esc(item.description || "เปิดประสบการณ์ใหม่ เติมทักษะ และเติบโตไปกับชุมชน BSRU")}</p><div class="login-promo-meta"><span><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${date}</span>${!fallback && item.place ? `<span><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(item.place)}</span>` : ""}</div></div><div class="login-promo-bottom"><span><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i> เปิดโอกาสใหม่ไปด้วยกัน</span><span class="login-promo-hint">ปัดหรือเลื่อนเพื่อดูเพิ่มเติม</span></div></div><div class="login-promo-controls"><button type="button" data-action="promo-slide" data-id="prev" aria-label="ประชาสัมพันธ์ก่อนหน้า">←</button>${items.map((_, i) => `<button type="button" data-action="promo-slide" data-id="${i}" class="${i === index ? "active" : ""}" aria-label="ประชาสัมพันธ์รายการที่ ${i + 1}"></button>`).join("")}<button type="button" data-action="promo-slide" data-id="next" aria-label="ประชาสัมพันธ์ถัดไป">→</button></div></div>`;
  }
  function selector() {
    return `<section class="portal role-selector" aria-labelledby="role-page-title">
  <div class="portal-intro">
    <span class="role-eyebrow"><span aria-hidden="true"></span> BSRU WORKSHOP</span>
    <h1 id="role-page-title">ทุกการเรียนรู้<br>เริ่มต้นที่<span>โอกาสใหม่</span></h1>
    <p class="portal-description">พื้นที่สำหรับค้นพบเวิร์กช็อป พัฒนาทักษะ<br class="role-desktop-break"> และติดตามการเรียนรู้ของคุณในที่เดียว</p>
    <div class="portal-photo"><img src="${PHOTOS.team}" alt="ผู้เข้าร่วมแลกเปลี่ยนความรู้และทำกิจกรรมร่วมกัน" fetchpriority="high"><div class="role-photo-caption"><span class="role-photo-mark" aria-hidden="true">✦</span><span>เรียนรู้วันนี้ ต่อยอดได้ทุกวัน</span></div></div>
    <p class="role-brand-note">เรียนรู้ · เชื่อมต่อ · เติบโตไปด้วยกัน</p>
  </div>
  <div class="portal-options">
    <div class="portal-options-heading"><span class="role-step">เริ่มต้นใช้งาน</span><h2>เลือกพื้นที่ของคุณ</h2><p class="muted">เลือกกลุ่มผู้ใช้งานเพื่อเข้าสู่ระบบ</p></div>
    <div class="choices">
      <button type="button" class="panel choice learner-choice" data-action="portal" data-id="user" aria-labelledby="learner-role-title" aria-describedby="learner-role-description">
        <div class="choice-heading"><span class="choice-icon"><i class="fa-solid fa-user-graduate" aria-hidden="true"></i></span><span class="role-card-label">สำหรับผู้เข้าร่วมอบรม</span><span class="role-number" aria-hidden="true">01</span></div>
        <h3 id="learner-role-title">นักศึกษา / อาจารย์ / เจ้าหน้าที่</h3>
        <p id="learner-role-description">ค้นหาเวิร์กช็อป ลงทะเบียนเข้าร่วม<br>และติดตามชั่วโมงอบรมสะสม</p>
        <span class="choice-link">เข้าสู่ระบบผู้เข้าร่วม <span aria-hidden="true">→</span></span>
      </button>
      <button type="button" class="panel choice staff-choice" data-action="portal" data-id="staff" aria-labelledby="admin-role-title" aria-describedby="admin-role-description">
        <div class="choice-heading"><span class="choice-icon"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i></span><span class="role-card-label">สำหรับผู้ดูแลระบบ</span><span class="role-number" aria-hidden="true">02</span></div>
        <h3 id="admin-role-title">เจ้าหน้าที่ (แอดมิน)</h3>
        <p id="admin-role-description">จัดการกิจกรรม อนุมัติบัญชีผู้ใช้งาน<br>และดูแลรายชื่อผู้เข้าร่วมอบรม</p>
        <span class="choice-link">เข้าสู่ระบบแอดมิน <span aria-hidden="true">→</span></span>
      </button>
    </div>
    <p class="portal-help"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>เจ้าหน้าที่ที่ต้องการเข้าร่วมอบรม เลือกกลุ่มผู้เข้าร่วม</span></p>
  </div>
</section>`;
  }
  function loginWithPromo() {
    const a = state.portal === "staff";
    return login().replace(
      /<div class="intro">[\s\S]*?<\/div><\/div><section class="form">/,
      `<div class="intro">${loginPromo(a)}</div><section class="form">`,
    );
  }
  function login() {
    const a = state.portal === "staff";
    return `<section class="login"><div class="intro"><img class="login-cover" src="${PHOTOS.team}" alt=""><div class="login-copy"><img class="login-logo" src="${LOGO}" alt="โลโก้แอป BSRU Workshop"><div class="eyebrow" style="color:#ffcc89">${a ? "MANAGE & CONNECT" : "YOUR NEXT CHAPTER"}</div><h1>${a ? "จัดการทุกกิจกรรม<br>ได้ในพื้นที่เดียว" : "ทักษะใหม่<br>โอกาสใหม่ เริ่มที่นี่"}</h1><p>${a ? "ดูแลเวิร์กช็อปและผู้เข้าร่วม พร้อมเชื่อมต่อข้อมูลถึงผู้ใช้งานทันที" : "ค้นพบเวิร์กช็อปที่ใช่ พัฒนาศักยภาพของคุณไปกับชุมชน BSRU"}</p><div class="row space login-promise"><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i><span>LEARNING NEVER STOPS.</span></div></div></div><section class="form"><div class="eyebrow">BSRU WORKSHOP</div><h2>ยินดีต้อนรับ${a ? "เจ้าหน้าที่" : "กลับมา"} 👋</h2><p class="muted">เข้าสู่ระบบ${a ? "สำหรับเจ้าหน้าที่" : "เพื่อเริ่มต้นการเรียนรู้"}</p><form id="login-form">${input("อีเมล หรือ เบอร์โทรศัพท์", "identity", "text", 'autocomplete="username" placeholder="กรอกอีเมลหรือเบอร์โทรศัพท์"')}${input("รหัสผ่าน", "password", "password", 'autocomplete="current-password" minlength="6" placeholder="กรอกรหัสผ่าน"')}<div class="error" id="login-error" role="alert"></div><button class="btn primary login-submit" ${!ready ? "disabled" : ""}>เข้าสู่ระบบ <span aria-hidden="true">→</span></button></form>${!a && otpAvailable ? `<p class="login-register">ยังไม่มีบัญชี? <button class="btn small" data-action="register">สมัครใช้งานใหม่</button></p>` : ""}${otpAvailable ? '<button class="btn login-forgot" data-action="forgot">ลืมรหัสผ่าน</button>' : '<div class="notice space">ระบบสำหรับสมาชิกที่ได้รับอนุมัติ หากต้องการบัญชีหรือกู้รหัสผ่าน กรุณาติดต่อเจ้าหน้าที่ผู้ดูแลระบบ</div>'}${localDemo ? `<details class="demo"><summary><i class="fa-solid fa-flask" aria-hidden="true"></i> บัญชีสำหรับทดลองใช้งาน</summary><div class="demo-content">${a ? "admin1@bsru.ac.th / 0899990001" : "std_demo@bsru.ac.th / 0812345678<br>staff_demo@bsru.ac.th (อาจารย์)"}<br>รหัสผ่านเริ่มต้น: <b>123456</b><br><span class="sub">หากเปลี่ยนรหัสผ่านแล้ว ให้ใช้รหัสผ่านล่าสุด</span>${!ready ? "<br>กำลังเตรียมระบบเข้าสู่ระบบ…" : ""}</div></details>` : ""}</section></section>`;
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
    const registrations = store.registrations,
      openWorkshops = store.workshops.filter(
        (w) => !w.closed && (phase(w) === "upcoming" || phase(w) === "ongoing"),
      ),
      waitingUsers = store.users.filter((x) => x.status === "WAITING"),
      openComplaints = store.complaints.filter((x) => x.status === "OPEN"),
      statusItems = [
        ["PENDING", "รอเข้าร่วม", "#e4a52b"],
        ["ATTENDED", "เข้าร่วมแล้ว", "#23b486"],
        ["ABSENT", "ไม่เข้าร่วม", "#e66b78"],
        ["CANCELLED", "ยกเลิก", "#9895aa"],
      ],
      counts = statusItems.map(([key, label, color]) => ({
        key,
        label,
        color,
        count: registrations.filter((r) => r.status === key).length,
      })),
      total = registrations.length,
      segments = counts.reduce(
        (parts, item) => {
          const start = parts.end;
          const end = start + (total ? (item.count / total) * 100 : 0);
          parts.items.push(`${item.color} ${start}% ${end}%`);
          parts.end = end;
          return parts;
        },
        { items: [], end: 0 },
      ),
      upcoming = store.workshops
        .filter((w) => phase(w) === "upcoming" || phase(w) === "ongoing")
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .slice(0, 6),
      trendMode =
        state.period === "day"
          ? "day"
          : state.period === "week"
            ? "week"
            : "month",
      trend = [],
      now = new Date();

    if (trendMode === "day") {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        trend.push({
          label: d.toLocaleDateString("th-TH", { weekday: "short" }),
          value: registrations.filter((r) => {
            const t = new Date(r.createdAt);
            return t >= d && t < next;
          }).length,
        });
      }
    } else if (trendMode === "week") {
      for (let i = 7; i >= 0; i--) {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - i * 7);
        const next = new Date(d);
        next.setDate(next.getDate() + 7);
        trend.push({
          label: d.toLocaleDateString("th-TH", {
            day: "numeric",
            month: "short",
          }),
          value: registrations.filter((r) => {
            const t = new Date(r.createdAt);
            return t >= d && t < next;
          }).length,
        });
      }
    } else {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        trend.push({
          label: d.toLocaleDateString("th-TH", { month: "short" }),
          value: registrations.filter((r) => {
            const t = new Date(r.createdAt);
            return t >= d && t < next;
          }).length,
        });
      }
    }
    const maxTrend = Math.max(1, ...trend.map((x) => x.value));
    const statCard = (label, value, icon, tone, page, caption) =>
      `<button class="staff-stat-card" data-action="page" data-id="${page}" style="--staff-stat:${tone}"><span class="staff-stat-icon"><i class="fa-solid ${icon}" aria-hidden="true"></i></span><span class="staff-stat-copy"><small>${label}</small><strong>${number(value)}</strong><em>${caption}</em></span><span class="staff-stat-arrow" aria-hidden="true">↗</span></button>`;
    const table = upcoming.length
      ? upcoming
          .map(
            (w) =>
              `<tr><td><strong>${esc(w.title)}</strong><span>${esc(w.place || "ไม่ระบุสถานที่")}</span></td><td>${esc(new Date(w.start).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }))}</td><td><strong>${number(occupancy(w.id))}</strong> / ${number(w.capacity)} คน</td><td>${badge(phase(w))}</td><td><button class="btn small" data-action="page" data-id="manage">จัดการ</button></td></tr>`,
          )
          .join("")
      : `<tr><td colspan="5"><div class="staff-empty"><i class="fa-regular fa-calendar-xmark"></i><strong>ยังไม่มีกิจกรรมที่กำลังจะมาถึง</strong><span>เมื่อมีเวิร์กช็อปใหม่ รายการจะแสดงที่นี่</span></div></td></tr>`;
    const trendBars = trend
      .map(
        (item) =>
          `<div class="staff-trend-item" title="${esc(item.label)}: ${number(item.value)} คน"><strong>${number(item.value)}</strong><div class="staff-trend-bar"><i style="height:${(item.value / maxTrend) * 100}%"></i></div><small>${esc(item.label)}</small></div>`,
      )
      .join("");
    return `<div class="staff-dashboard"><div class="staff-dashboard-head"><div>${title("STAFF OVERVIEW", "ภาพรวมการอบรม", "ติดตามกิจกรรม ผู้ลงทะเบียน และงานที่ต้องดำเนินการจากข้อมูลล่าสุด")}</div><div class="staff-dashboard-meta"><span class="live-dot"></span> สถานะการเชื่อมต่อ <span class="sync" data-sync-status role="status">${esc(syncMessage)}</span></div></div><div class="toolbar staff-period-toolbar"><span class="muted">ช่วงข้อมูลแนวโน้มการลงทะเบียน</span><div class="tabs">${[
      ["day", "วัน"],
      ["week", "สัปดาห์"],
      ["month", "เดือน"],
    ]
      .map(
        ([v, l]) =>
          `<button data-action="period" data-id="${v}" class="${state.period === v ? "active" : ""}">${l}</button>`,
      )
      .join(
        "",
      )}</div></div><div class="staff-stat-grid">${statCard("เวิร์กช็อปที่เปิดรับ", openWorkshops.length, "fa-calendar-check", "#854c9e", "manage", "กิจกรรมที่ยังเปิดรับสมัคร")}${statCard("จำนวนผู้ลงทะเบียน", registrations.filter((r) => r.status !== "CANCELLED").length, "fa-users", "#d98b30", "participants", "รายการที่ยังไม่ยกเลิก")}${statCard("ผู้ใช้งานรออนุมัติ", waitingUsers.length, "fa-user-clock", "#e4a52b", "approvals", "บัญชีที่รอตรวจสอบ")}${statCard("คำร้องที่รอดำเนินการ", openComplaints.length, "fa-comments", "#c85d77", "complaints", "คำร้องสถานะเปิด")}</div><div class="staff-dashboard-grid"><section class="panel staff-table-panel"><div class="staff-panel-heading"><div><span class="eyebrow">UPCOMING WORKSHOPS</span><h2>กิจกรรมที่กำลังจะมาถึง</h2><p class="muted">แสดงกิจกรรมตามวันเริ่มต้นและจำนวนที่นั่งล่าสุด</p></div><button class="btn small" data-action="page" data-id="manage">ดูทั้งหมด <span aria-hidden="true">→</span></button></div><div class="staff-table-wrap"><table class="staff-table"><thead><tr><th>กิจกรรม</th><th>วันที่</th><th>ผู้ลงทะเบียน / ที่นั่ง</th><th>สถานะ</th><th></th></tr></thead><tbody>${table}</tbody></table></div></section><section class="panel staff-donut-panel"><div class="staff-panel-heading"><div><span class="eyebrow">REGISTRATION STATUS</span><h2>สถานะผู้ลงทะเบียน</h2><p class="muted">รวมทั้งหมด ${number(total)} รายการ</p></div></div><div class="staff-donut-wrap"><div class="staff-donut" style="background:${total ? `conic-gradient(${segments.items.join(",")})` : "#ebe8f0"}"><strong>${number(total)}<small>รายการ</small></strong></div><div class="staff-legend">${counts.map((item) => `<div><span><i style="background:${item.color}"></i>${item.label}</span><strong>${number(item.count)}<small>${total ? Math.round((item.count / total) * 100) : 0}%</small></strong></div>`).join("")}</div></div>${!total ? '<p class="staff-empty-note">ยังไม่มีข้อมูลการลงทะเบียนในระบบ</p>' : ""}</section></div><section class="panel staff-trend-panel"><div class="staff-panel-heading"><div><span class="eyebrow">REGISTRATION TREND</span><h2>แนวโน้มจำนวนผู้ลงทะเบียน</h2><p class="muted">หน่วย: คน · นับจากวันที่สร้างรายการลงทะเบียน</p></div><span class="staff-trend-current">${trendMode === "day" ? "รายวัน" : trendMode === "week" ? "รายสัปดาห์" : "รายเดือน"}</span></div><div class="staff-trend-chart">${trendBars}</div>${registrations.length ? "" : '<div class="staff-empty"><i class="fa-solid fa-chart-line"></i><strong>ยังไม่มีข้อมูลแนวโน้ม</strong><span>เมื่อมีการลงทะเบียน กราฟจะแสดงตามช่วงเวลาที่เลือก</span></div>'}</section></div>`;
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
  function managementTable(list) {
    return (
      '<div class="panel tablewrap"><table><thead><tr><th>กิจกรรม</th><th>วันเริ่ม</th><th>ผู้สมัคร / ที่นั่ง</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>' +
      list
        .map(
          (w) =>
            '<tr><td><button class="activity-title" data-action="workshop-detail" data-id="' +
            w.id +
            '">' +
            esc(w.title) +
            "</button></td><td>" +
            esc(fmt(w.start)) +
            "</td><td>" +
            occupancy(w.id) +
            " / " +
            w.capacity +
            "</td><td>" +
            phaseLabel(w) +
            '</td><td><div class="staff-row-actions"><button class="btn small primary" data-action="participants-for" data-id="' +
            w.id +
            '">ผู้เข้าร่วม</button><button class="btn small" data-action="edit-workshop" data-id="' +
            w.id +
            '">แก้ไข</button>' +
            (!w.closed && scheduledPhase(w) !== "finished"
              ? '<button class="btn small danger" data-action="close-workshop" data-id="' +
                w.id +
                '">ปิดรับสมัคร</button>'
              : "") +
            "</div></td></tr>",
        )
        .join("") +
      "</tbody></table></div>"
    );
  }
  function workshops() {
    const a = staff();
    let list = store.workshops.filter(
      (w) =>
        (state.filter === "all" || phase(w) === state.filter) &&
        (!state.search ||
          (w.title + " " + w.place)
            .toLowerCase()
            .includes(state.search.toLowerCase())) &&
        (a ||
          (state.view === "open" &&
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
    return `${title(a ? "WORKSHOP MANAGEMENT" : "EXPLORE & REGISTER", a ? "จัดการเวิร์กช็อป" : state.view === "mine" ? "กิจกรรมของฉัน" : "ค้นพบเวิร์กช็อปที่ใช่", a ? "กิจกรรมที่สร้างจะปรากฏในฝั่งผู้ใช้งานทันที" : "เลือกกิจกรรมเพื่อพัฒนาทักษะและเปิดประสบการณ์ใหม่", a ? '<button class="btn primary" data-action="add-workshop"><i class="fa-solid fa-plus"></i> เพิ่มเวิร์กช็อป</button>' : "")}${
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
      ["finished", "เสร็จสิ้นแล้ว"],
      ["closed", "ปิดเวิร์กช็อปแล้ว"],
    ]
      .map(
        ([v, l]) =>
          `<option value="${v}" ${state.filter === v ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select><label class="date-filter">ตั้งแต่ <input id="date-from" type="date" value="${esc(state.dateFrom || "")}"></label><label class="date-filter">ถึง <input id="date-to" type="date" value="${esc(state.dateTo || "")}"></label><span class="muted">${list.length} กิจกรรม</span></div>${
      a
        ? managementTable(
            list.sort((a, b) => new Date(a.start) - new Date(b.start)),
          )
        : '<div class="grid three">' +
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
    return `${title("USER APPROVAL", "อนุมัติผู้ใช้งาน", "ตรวจสอบข้อมูลผู้สมัครใหม่ก่อนเปิดสิทธิ์เข้าใช้งาน")}<div class="staff-work-toolbar"><input id="approval-search" type="search" aria-label="ค้นหาผู้สมัคร" placeholder="ค้นหาชื่อ รหัส หรืออีเมล" value="${esc(state.approvalQuery)}"><select id="approval-status" aria-label="กรองสถานะ"><option value="WAITING" ${state.approvalStatus === "WAITING" ? "selected" : ""}>รออนุมัติ</option><option value="APPROVED" ${state.approvalStatus === "APPROVED" ? "selected" : ""}>อนุมัติแล้ว</option><option value="REJECTED" ${state.approvalStatus === "REJECTED" ? "selected" : ""}>ปฏิเสธแล้ว</option><option value="all" ${state.approvalStatus === "all" ? "selected" : ""}>ทั้งหมด</option></select><span class="muted">${number(list.length)} รายการ</span></div><div class="panel space tablewrap"><table><thead><tr><th>ผู้สมัคร</th><th>ประเภท / รหัส</th><th>ช่องทางติดต่อ</th><th>คณะ / สาขา</th><th>สถานะ / จัดการ</th></tr></thead><tbody>${list.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.type)}<br>${esc(u.code)}</td><td>${esc(u.email || "—")}<br>${esc(u.phone || "—")}</td><td>${esc(u.faculty)}<br><span class="muted">${esc(u.major || "—")}</span></td><td>${badge(u.status)}${u.status === "WAITING" ? `<div class="staff-row-actions"><button class="btn small primary" data-action="approve" data-id="${u.id}">อนุมัติ</button><button class="btn small danger" data-action="reject" data-id="${u.id}">ปฏิเสธ</button></div>` : ""}</td></tr>`).join("") || `<tr><td colspan="5">${empty("ไม่พบผู้สมัครที่ตรงกับตัวกรอง")}</td></tr>`}</tbody></table></div>`;
  }
  function participantsV2() {
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
    return `${title("PARTICIPANT LIST", "รายชื่อผู้เข้าร่วมอบรม", "ค้นหา กรอง และบันทึกผลการเข้าร่วมจากรายการจริง")}<div class="staff-work-toolbar"><select id="participant-filter" aria-label="เลือกเวิร์กช็อป"><option value="all">ทุกเวิร์กช็อป</option>${store.workshops.map((w) => `<option value="${w.id}" ${participantWorkshop === w.id ? "selected" : ""}>${esc(w.title)}</option>`).join("")}</select><input id="participant-search" type="search" aria-label="ค้นหาผู้เข้าร่วม" placeholder="ค้นหาชื่อหรือรหัสนักศึกษา" value="${esc(state.participantQuery)}"><select id="participant-status" aria-label="กรองสถานะ"><option value="all" ${state.participantStatus === "all" ? "selected" : ""}>ทุกสถานะ</option><option value="PENDING" ${state.participantStatus === "PENDING" ? "selected" : ""}>รอเข้าร่วม</option><option value="ATTENDED" ${state.participantStatus === "ATTENDED" ? "selected" : ""}>เข้าร่วมแล้ว</option><option value="ABSENT" ${state.participantStatus === "ABSENT" ? "selected" : ""}>ไม่เข้าร่วม</option><option value="CANCELLED" ${state.participantStatus === "CANCELLED" ? "selected" : ""}>ยกเลิก</option></select><button class="btn small" data-action="export-participants"><i class="fa-solid fa-download" aria-hidden="true"></i> Export CSV</button></div>${
      list.length
        ? `<div class="panel tablewrap"><table><thead><tr><th>ลำดับ</th><th>ชื่อ-นามสกุล</th><th>รหัสประจำตัว</th><th>สถานะ</th><th>เช็กชื่อ</th></tr></thead><tbody>${list
            .map((r, i) => {
              const u = store.users.find((x) => x.id === r.userId);
              return `<tr><td>${i + 1}</td><td><b>${esc(u?.name || "ไม่พบข้อมูล")}</b></td><td>${esc(u?.code || "—")}</td><td>${badge(r.status)}</td><td>${r.status !== "CANCELLED" ? `<button class="btn small primary" data-action="attend" data-id="${r.id}">เข้าร่วมงาน</button><button class="btn small danger" data-action="absent" data-id="${r.id}">ไม่เข้าร่วม</button>` : "ผู้ใช้ยกเลิกแล้ว"}</td></tr>`;
            })
            .join("")}</tbody></table></div>`
        : empty("ยังไม่มีรายชื่อที่ตรงกับตัวกรอง")
    }`;
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
    "complaints",
  ];
  const requestedPage = () => {
    const page = window.location?.hash?.slice(1);
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
  function render() {
    let content;
    if (!state.portal) content = selector();
    else if (!user())
      content = state.portal === "staff" ? login() : loginWithPromo();
    else if (state.page === "dashboard")
      content = staff() ? staffDashboard() : learnerDashboard();
    else if (staff())
      content = (
        {
          manage: workshops,
          approvals: approvalsV2,
          participants: participantsV2,
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
    const view = [state.portal, state.userId, state.page].join(":");
    const changed = view !== previousView;
    const hadView = previousView !== null;
    $("#app").innerHTML = shell(content);
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
      const hash = "#" + state.page;
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
  function registerModal() {
    if (state.portal !== "user" || user()) return;
    if (!otpAvailable)
      return toast(
        "การสมัครออนไลน์ยังไม่เปิดให้บริการ กรุณาติดต่อเจ้าหน้าที่ผู้ดูแลระบบ",
      );
    openModal(
      "สมัครใช้งานใหม่",
      `<p class="muted">ยืนยันช่องทางติดต่อด้วย OTP แล้วรอเจ้าหน้าที่อนุมัติสิทธิ์</p><form id="register-form">${input("ชื่อ-นามสกุล", "name", "text", 'maxlength="120"')}<div class="grid two"><div class="field"><label for="type">ประเภทผู้ใช้งาน</label><select id="type" name="type"><option>นักศึกษา</option><option>อาจารย์</option></select></div>${input("รหัสประจำตัว", "code", "text", 'maxlength="30"')}</div><div class="field"><label for="faculty">คณะ / วิทยาลัย</label><select id="faculty" name="faculty" required><option value="">เลือกคณะ / วิทยาลัย</option>${Object.keys(
        PROGRAMS,
      )
        .map((x) => `<option>${esc(x)}</option>`)
        .join(
          "",
        )}</select></div><div class="field"><label for="major">สาขา / หลักสูตร</label><select id="major" name="major" required disabled><option value="">กรุณาเลือกคณะก่อน</option></select></div><p class="sub">รายชื่อ 81 หลักสูตรตาม <a href="https://course.bsru.ac.th/admission/" target="_blank" rel="noopener">BSRU Admission</a> ตรวจสอบ 27 ต.ค. 2569</p><div class="grid two"><div class="field"><label for="email">อีเมลมหาวิทยาลัย (@bsru.ac.th เท่านั้น)</label><input id="email" name="email" type="email" maxlength="150" autocomplete="email" required pattern="[^@ ]+@[Bb][Ss][Rr][Uu][.][Aa][Cc][.][Tt][Hh]" placeholder="student@bsru.ac.th"></div><div class="field"><label for="phone">เบอร์โทรศัพท์</label><input id="phone" name="phone" type="tel" required pattern="0[0-9]{8,9}" maxlength="10" autocomplete="tel"></div></div><div class="field"><label for="register-channel">ส่ง OTP ยืนยันสมัครสมาชิกไปที่</label><select id="register-channel" name="channel"><option value="email">อีเมล</option><option value="phone">เบอร์โทรศัพท์</option></select></div>${passwordFields("new-password", "confirm-password")}<div class="error" id="form-error" role="alert"></div><button class="btn primary" type="submit">รับ OTP เพื่อยืนยันสมัครสมาชิก</button></form>`,
    );
  }
  function passwordFields(name, confirmation) {
    return `${input("รหัสผ่านใหม่", name, "password", 'autocomplete="new-password" minlength="12" maxlength="128" aria-describedby="password-hint"')}${input("ยืนยันรหัสผ่าน", confirmation, "password", 'autocomplete="new-password" minlength="12" maxlength="128"')}<p class="sub" id="password-hint">${passwordPolicy}<br>เช่น ใช้วลีที่จำได้ผสมอักษร ตัวเลข และสัญลักษณ์ โดยไม่ใช้ข้อมูลส่วนตัว</p><div class="sub" id="password-strength" aria-live="polite"></div>`;
  }
  function forgotModal() {
    if (!state.portal || user()) return;
    if (!otpAvailable)
      return toast(
        "การกู้รหัสผ่านออนไลน์ยังไม่เปิดให้บริการ กรุณาติดต่อเจ้าหน้าที่ผู้ดูแลระบบ",
      );
    openModal(
      "ลืมรหัสผ่าน",
      `<p class="muted">เลือกช่องทางที่ผูกกับบัญชี ${state.portal === "staff" ? "เจ้าหน้าที่" : "ผู้ใช้"} เพื่อรับ OTP แล้วตั้งรหัสผ่านใหม่</p><div class="notice">โหมดสาธิต: OTP จะแสดงในกล่องข้อความของแอป ไม่มีการส่งอีเมลหรือ SMS จริง</div><form id="forgot-form" class="space"><div class="field"><label for="recovery-channel">รับ OTP ผ่าน</label><select id="recovery-channel" name="channel"><option value="email">อีเมล</option><option value="phone">เบอร์โทรศัพท์</option></select></div>${input("อีเมลหรือเบอร์โทรศัพท์ที่ผูกกับบัญชี", "reset-contact", "text", 'autocomplete="email tel" maxlength="150"')}<div class="error" role="alert"></div><button class="btn primary">รับ OTP</button></form><p class="sub">บัญชีสาธิต: ผู้ใช้ 0812345678 · อาจารย์ 0899990002 · เจ้าหน้าที่ 0899990001</p>`,
    );
  }
  async function issueOtp(data, replaceId) {
    const result = await apiRequest("/api/otp/request", {
      method: "POST",
      body: JSON.stringify({
        purpose: data.purpose,
        portal: data.portal,
        channel: data.channel,
        contact: data.contact,
        draft: data.draft,
        password: data.pendingPassword,
        replaceChallengeId: replaceId,
      }),
    });
    for (const [id, c] of otpChallenges)
      if (c.contact === data.contact) otpChallenges.delete(id);
    const { id: unused, ...safeData } = data;
    delete safeData.pendingPassword;
    const challengeId = result.challengeId;
    otpChallenges.set(challengeId, {
      ...safeData,
      challengeId,
      expires: Date.parse(result.expiresAt),
      attempts: 0,
    });
    currentChallenge = challengeId;
    otpModal(challengeId, result.code || "");
    return challengeId;
  }
  function otpModal(id, code) {
    const c = otpChallenges.get(id);
    openModal(
      "ยืนยัน OTP",
      `<p>ช่องทาง: <b>${c.channel === "email" ? "อีเมล" : "เบอร์โทรศัพท์"}</b> · ${esc(c.contact)}</p><div class="otp-inbox"><div class="eyebrow">กล่องรับ OTP จำลอง • ไม่ได้ส่งจริง</div><strong>${esc(code)}</strong><p>ใช้ได้ครั้งเดียวภายใน 5 นาที · กรอกผิดได้ไม่เกิน 5 ครั้ง</p></div><form id="otp-form" data-id="${id}" class="space">${input("รหัส OTP 6 หลัก", "otp", "text", 'inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="one-time-code"')}<div class="error" role="alert"></div><div class="row"><button class="btn primary">ยืนยัน OTP</button><button type="button" class="btn" data-action="otp-resend" data-id="${id}">ขอ OTP ใหม่ (เว้น 60 วินาที)</button></div></form>`,
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
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-action]");
    if (!b || b.disabled) return;
    let a = b.dataset.action;
    const id = b.dataset.id;
    if (a === "answer-yes" || a === "answer-no")
      return finishConfirm(a === "answer-yes");
    if (pendingConfirm) return;
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
            switch: "ต้องการออกจากบัญชีนี้และกลับไปเลือกสิทธิ์จริงใช่ไหม?",
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
        portal: null,
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
      closeModal();
      return render();
    }
    if (a === "workshop-detail") return workshopDetail(id);
    if (a === "portal") {
      clearRecovery();
      closeModal();
      state.portal = id;
      state.userId = null;
      state.page = "dashboard";
      return render();
    }
    if (a === "page") {
      state.page = id;
      state.view = id === "mine" ? "mine" : "open";
      state.search = "";
      state.filter = "all";
      state.dateFrom = "";
      state.dateTo = "";
      if (id === "notifications") {
        state.notificationFilter = "general";
        state.notificationQuery = "";
      }
      return render();
    }
    if (a === "register") return registerModal();
    if (a === "support" && member()) return supportModal();
    if (a === "forgot") {
      clearRecovery();
      return forgotModal();
    }
    if (a === "otp-resend") {
      const c = otpChallenges.get(id);
      if (!c || c.portal !== state.portal)
        return toast("กรุณาเริ่มขอ OTP ใหม่");
      try {
        if (
          !(await askConfirm(
            "ต้องการขอ OTP ใหม่จริงใช่ไหม? รหัสเดิมจะถูกยกเลิก",
          ))
        )
          return;
        await issueOtp(c, id);
      } catch (err) {
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
    if (a === "period") {
      state.period = id;
      return render();
    }
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
    if (a === "edit-workshop") return workshopModal(id);
    if (a === "participants-for") {
      participantWorkshop = id;
      state.page = "participants";
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
  document.addEventListener("change", (e) => {
    if (["date-from", "date-to"].includes(e.target.id)) {
      state[e.target.id === "date-from" ? "dateFrom" : "dateTo"] =
        e.target.value;
      render();
    }
    if (e.target.id === "phase-filter") {
      state.filter = e.target.value;
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
    if (e.target.id === "search") {
      const pos = e.target.selectionStart;
      state.search = e.target.value;
      render();
      $("#search").focus();
      $("#search").setSelectionRange(pos, pos);
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
    const f = e.target;
    if (
      ![
        "login-form",
        "register-form",
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
        if (!(await askConfirm("ต้องการขอ OTP ผ่านช่องทางนี้จริงใช่ไหม?")))
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
        currentChallenge = null;
        if (c.purpose === "register") {
          closeModal();
          toast("ยืนยัน OTP และสมัครสมาชิกสำเร็จ · รอเจ้าหน้าที่อนุมัติ");
        } else {
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
        if (!(await askConfirm("ต้องการบันทึกรหัสผ่านใหม่นี้จริงใช่ไหม?")))
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
        toast("ตั้งรหัสผ่านใหม่สำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่");
      }
      if (f.id === "login-form") {
        if (!ready) throw Error("กำลังเตรียมระบบ กรุณารอสักครู่");
        const logged = await apiRequest("/api/login", {
          method: "POST",
          body: JSON.stringify({
            identity: d.identity,
            password: d.password,
            portal: state.portal,
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
      if (f.id === "register-form") {
        if (!ready) throw Error("ระบบกำลังเตรียมข้อมูล กรุณารอสักครู่");
        if (state.portal !== "user" || user())
          throw Error("กรุณาเข้าสู่หน้าสมัครสมาชิกผู้ใช้");
        const draft = {
          name: d.name,
          type: d.type,
          code: d.code,
          email: normalize(d.email || ""),
          phone: d.phone || "",
          faculty: d.faculty,
          major: d.major,
        };
        validateDraft(draft);
        const problem = passwordError(d["new-password"], d["confirm-password"]);
        if (problem) throw Error(problem);
        if (!["email", "phone"].includes(d.channel) || !draft[d.channel])
          throw Error("กรุณากรอกช่องทางที่เลือกสำหรับรับ OTP");
        if (
          !(await askConfirm("ต้องการยืนยันข้อมูลสมัครและขอ OTP จริงใช่ไหม?"))
        )
          return;
        await issueOtp({
          purpose: "register",
          portal: "user",
          channel: d.channel,
          contact: draft[d.channel],
          draft,
          pendingPassword: d["new-password"],
        });
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
      if (err?.isConnected) err.textContent = error.message;
      else toast(error.message);
    } finally {
      if (submit?.isConnected) submit.disabled = false;
    }
  });
  async function initializeLocalApp() {
    try {
      const session = await apiRequest("/api/session");
      otpAvailable = session.otpAvailable === true;
      updateSync("เชื่อมต่อแล้ว");
      if (session.user) {
        apiCsrf = session.csrf;
        startApiPolling();
        const source = store.workshops.map((w) => ({ ...w }));
        const loaded = await apiRequest("/api/store");
        Object.assign(store, loaded.store);
        window.__demoWorkshopSource = source;
        overlayDemoImages();
        state.userId = session.user.id;
        state.portal = session.user.role;
        state.page = requestedPage();
        state.view = state.page === "mine" ? "mine" : "open";
      }
      ready = true;
      render();
    } catch (error) {
      ready = true;
      render();
      toast("เชื่อมต่อฐานข้อมูลไม่ได้: " + error.message);
    }
  }
  render();
  initializeLocalApp();
})();
