"use strict";

module.exports = function createStore({
  db,
  localDateInput,
  publicUser,
  now,
  validCover,
}) {
  function workshopRows() {
    return db
      .prepare(
        `SELECT w.*, (SELECT count(*) FROM registrations r WHERE r.workshop_id=w.id AND r.status IN ('PENDING','ATTENDED','ABSENT')) AS occupancy FROM workshops w ORDER BY w.start_at`,
      )
      .all();
  }
  function stateFromDb(role, userId) {
    const staff = role === "staff";
    const users = staff
      ? db.prepare("SELECT * FROM users ORDER BY created_at").all()
      : db.prepare("SELECT * FROM users WHERE id=?").all(userId);
    const workshops = db
      .prepare("SELECT * FROM workshops ORDER BY start_at")
      .all()
      .map((w) => ({
        id: w.id,
        title: w.title,
        description: w.description,
        cover: w.cover,
        start: localDateInput(w.start_at),
        end: localDateInput(w.end_at),
        place: w.place,
        capacity: w.capacity,
        hours: w.hours,
        closed: Boolean(w.closed),
        icon: "fa-graduation-cap",
        category: "BSRU WORKSHOP",
      }));
    const registrations = staff
      ? db.prepare("SELECT * FROM registrations ORDER BY created_at").all()
      : db
          .prepare(
            "SELECT * FROM registrations WHERE user_id=? ORDER BY created_at",
          )
          .all(userId);
    const complaints = staff
      ? db.prepare("SELECT * FROM complaints ORDER BY created_at DESC").all()
      : db
          .prepare(
            "SELECT * FROM complaints WHERE user_id=? ORDER BY created_at DESC",
          )
          .all(userId);
    const ratings = staff
      ? db.prepare("SELECT * FROM ratings ORDER BY created_at").all()
      : db
          .prepare("SELECT * FROM ratings WHERE user_id=? ORDER BY created_at")
          .all(userId);
    const notifications = staff
      ? []
      : db
          .prepare(
            "SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC",
          )
          .all(userId);
    return {
      users: users.map(publicUser),
      workshops,
      registrations: registrations.map((r) => ({
        id: r.id,
        userId: r.user_id,
        workshopId: r.workshop_id,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        ratingEvent: r.id,
      })),
      complaints: complaints.map((c) => ({
        id: c.id,
        userId: c.user_id,
        issue: c.issue,
        detail: c.detail,
        status: c.status,
        createdAt: c.created_at,
        replies: db
          .prepare(
            "SELECT * FROM complaint_replies WHERE complaint_id=? ORDER BY created_at",
          )
          .all(c.id)
          .map((r) => ({
            id: r.id,
            staffId: r.staff_id,
            staffName:
              db.prepare("SELECT name FROM users WHERE id=?").get(r.staff_id)
                ?.name || "",
            text: r.message,
            createdAt: r.created_at,
          })),
      })),
      ratings: ratings.map((r) => ({
        id: r.id,
        eventId: r.registration_id,
        userId: r.user_id,
        registrationId: r.registration_id,
        score: r.score,
        createdAt: r.created_at,
      })),
      notifications: notifications.map((n) => ({
        id: n.id,
        userId: n.user_id,
        title: n.title,
        body: n.message,
        kind: n.related_type,
        refId: n.related_id,
        readAt: n.read_at,
        createdAt: n.created_at,
      })),
      revision:
        db.prepare("SELECT revision FROM app_state WHERE id=1").get()
          ?.revision || 0,
    };
  }
  function ensureSnapshot() {
    const existing = db
      .prepare("SELECT revision,data_json FROM app_state WHERE id=1")
      .get();
    if (existing) {
      const snapshot = JSON.parse(existing.data_json);
      let changed = false;
      for (const w of snapshot.workshops || [])
        for (const field of ["start", "end"])
          if (typeof w[field] === "string" && w[field].endsWith("Z")) {
            w[field] = localDateInput(w[field]);
            changed = true;
          }
      if (changed)
        db.prepare(
          "UPDATE app_state SET data_json=?,updated_at=? WHERE id=1",
        ).run(JSON.stringify(snapshot), now());
      return;
    }
    const initial = stateFromDb("staff", "admin");
    db.prepare(
      "INSERT INTO app_state(id,revision,data_json,updated_at) VALUES(1,?,?,?)",
    ).run(0, JSON.stringify(initial), now());
  }

  function viewFromSnapshot(snapshot, user) {
    if (user.role === "staff") return snapshot;
    const onlyMine = (items) => items.filter((item) => item.userId === user.id);
    return {
      ...snapshot,
      users: snapshot.users.filter((item) => item.id === user.id),
      registrations: onlyMine(snapshot.registrations),
      ratings: onlyMine(snapshot.ratings),
      complaints: onlyMine(snapshot.complaints),
      notifications: onlyMine(snapshot.notifications),
    };
  }
  function equalJson(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  function mergeSnapshot(user, incoming) {
    if (
      !incoming ||
      !Array.isArray(incoming.users) ||
      !Array.isArray(incoming.workshops) ||
      !Array.isArray(incoming.registrations) ||
      !Array.isArray(incoming.ratings) ||
      !Array.isArray(incoming.complaints) ||
      !Array.isArray(incoming.notifications)
    )
      throw Object.assign(new Error("ข้อมูลระบบไม่ครบ"), { status: 400 });
    const currentRow = db
      .prepare("SELECT revision,data_json FROM app_state WHERE id=1")
      .get();
    const current = JSON.parse(currentRow.data_json);
    if (Number(incoming.revision) !== Number(currentRow.revision) + 1)
      throw Object.assign(
        new Error("ข้อมูลเปลี่ยนจากอีกหน้าต่างแล้ว กรุณาโหลดหน้าใหม่"),
        { status: 409 },
      );
    if (user.role === "staff") {
      const oldUsers = new Map(current.users.map((x) => [x.id, x]));
      for (const next of incoming.users) {
        const old = oldUsers.get(next.id);
        if (!old)
          throw Object.assign(
            new Error("เพิ่มบัญชีได้ผ่านขั้นตอนสมัครและยืนยันเท่านั้น"),
            { status: 403 },
          );
        if (
          !equalJson(
            { ...next, status: old.status },
            { ...old, status: old.status },
          )
        )
          throw Object.assign(
            new Error("เจ้าหน้าที่แก้ไขข้อมูลส่วนตัวบัญชีอื่นไม่ได้"),
            { status: 403 },
          );
        if (!["WAITING", "APPROVED", "REJECTED"].includes(next.status))
          throw Object.assign(new Error("สถานะบัญชีไม่ถูกต้อง"), {
            status: 400,
          });
      }
      if (incoming.users.length !== current.users.length)
        throw Object.assign(new Error("ไม่อนุญาตให้ลบบัญชีผู้ใช้"), {
          status: 403,
        });
      const oldWorkshops = new Map(current.workshops.map((x) => [x.id, x]));
      for (const w of incoming.workshops) {
        const old = oldWorkshops.get(w.id);
        if (
          old &&
          Number(w.capacity) <
            db
              .prepare(
                `SELECT count(*) n FROM registrations WHERE workshop_id=? AND status IN ('PENDING','ATTENDED','ABSENT')`,
              )
              .get(w.id).n
        )
          throw Object.assign(
            new Error("จำนวนที่นั่งต้องไม่น้อยกว่าจำนวนผู้ลงทะเบียน"),
            { status: 409 },
          );
        if (
          old &&
          Date.parse(old.end) <= Date.now() &&
          Boolean(w.closed) !== Boolean(old.closed)
        )
          throw Object.assign(
            new Error("ไม่สามารถปิดรับกิจกรรมที่เสร็จสิ้นแล้ว"),
            { status: 409 },
          );
      }
      if (
        current.workshops.some(
          (old) => !incoming.workshops.some((w) => w.id === old.id),
        )
      )
        throw Object.assign(new Error("ไม่อนุญาตให้ลบเวิร์กช็อป"), {
          status: 403,
        });
      if (
        incoming.workshops.some(
          (w) =>
            !w.id ||
            !w.title ||
            !w.start ||
            !w.end ||
            !w.place ||
            !Number.isInteger(Number(w.capacity)) ||
            Number(w.capacity) < 1 ||
            !Number.isFinite(Number(w.hours)) ||
            Number(w.hours) < 0.5 ||
            (Number(w.hours) * 2) % 1 !== 0 ||
            Date.parse(w.end) <= Date.parse(w.start) ||
            Number(w.hours) >
              (Date.parse(w.end) - Date.parse(w.start)) / 3600000 ||
            !validCover(w.cover),
        )
      )
        throw Object.assign(new Error("ข้อมูลเวิร์กช็อปหรือรูปภาพไม่ถูกต้อง"), {
          status: 400,
        });
      for (const r of incoming.registrations) {
        const old = current.registrations.find((x) => x.id === r.id);
        if (!old)
          throw Object.assign(
            new Error("ไม่อนุญาตให้เจ้าหน้าที่สร้างรายการลงทะเบียนโดยตรง"),
            { status: 403 },
          );
        if (
          r.userId !== old.userId ||
          r.workshopId !== old.workshopId ||
          !["PENDING", "ATTENDED", "ABSENT", "CANCELLED"].includes(r.status) ||
          (r.status !== old.status &&
            !["ATTENDED", "ABSENT"].includes(r.status)) ||
          (old.status === "CANCELLED" && r.status !== "CANCELLED")
        )
          throw Object.assign(new Error("รายการลงทะเบียนไม่ถูกต้อง"), {
            status: 400,
          });
      }
      if (incoming.registrations.length !== current.registrations.length)
        throw Object.assign(new Error("ไม่อนุญาตให้ลบรายการลงทะเบียน"), {
          status: 403,
        });
      for (const c of incoming.complaints) {
        const old = current.complaints.find((x) => x.id === c.id);
        if (!old)
          throw Object.assign(
            new Error("ไม่อนุญาตให้เจ้าหน้าที่สร้างคำร้องแทนผู้ใช้"),
            { status: 403 },
          );
        if (
          c.userId !== old.userId ||
          c.issue !== old.issue ||
          c.detail !== old.detail
        )
          throw Object.assign(
            new Error("แก้ไขหัวข้อหรือรายละเอียดคำร้องไม่ได้"),
            { status: 403 },
          );
        for (const reply of c.replies || [])
          if (
            !old.replies?.some((y) => y.id === reply.id) &&
            reply.staffId !== user.id
          )
            throw Object.assign(new Error("ผู้ตอบคำร้องไม่ถูกต้อง"), {
              status: 403,
            });
      }
      if (incoming.complaints.length !== current.complaints.length)
        throw Object.assign(new Error("ไม่อนุญาตให้ลบคำร้อง"), { status: 403 });
      for (const collection of ["ratings", "notifications"])
        if (
          current[collection].some(
            (old) => !incoming[collection].some((item) => item.id === old.id),
          )
        )
          throw Object.assign(
            new Error("ไม่อนุญาตให้ลบประวัติหรือการแจ้งเตือน"),
            { status: 403 },
          );
    } else {
      const own = current.users.find((x) => x.id === user.id),
        proposedUser = incoming.users.length === 1 ? incoming.users[0] : null;
      const stripPresentation = (rows) =>
        rows.map(({ cover, icon, category, photoSource, ...item }) => item);
      if (
        !proposedUser ||
        !equalJson(own, proposedUser) ||
        !equalJson(
          stripPresentation(current.workshops),
          stripPresentation(incoming.workshops),
        )
      )
        throw Object.assign(
          new Error("ไม่มีสิทธิ์แก้ไขบัญชีอื่นหรือเวิร์กช็อป"),
          { status: 403 },
        );
      if (
        incoming.registrations.some((r) => r.userId !== user.id) ||
        incoming.ratings.some((r) => r.userId !== user.id) ||
        incoming.complaints.some((c) => c.userId !== user.id) ||
        incoming.notifications.some((n) => n.userId !== user.id)
      )
        throw Object.assign(
          new Error("ไม่อนุญาตให้เข้าถึงข้อมูลของผู้ใช้อื่น"),
          { status: 403 },
        );
      for (const collection of [
        "registrations",
        "ratings",
        "complaints",
        "notifications",
      ])
        if (
          current[collection].some(
            (old) =>
              old.userId === user.id &&
              !incoming[collection].some((item) => item.id === old.id),
          )
        )
          throw Object.assign(
            new Error("ไม่อนุญาตให้ลบประวัติหรือการแจ้งเตือน"),
            { status: 403 },
          );
      for (const r of incoming.registrations) {
        const old = current.registrations.find((x) => x.id === r.id);
        if (
          old &&
          (old.userId !== user.id ||
            old.workshopId !== r.workshopId ||
            !(
              (old.status === "PENDING" && r.status === "CANCELLED") ||
              (old.status === "CANCELLED" && r.status === "PENDING") ||
              old.status === r.status
            ))
        )
          throw Object.assign(new Error("ไม่อนุญาตให้เปลี่ยนผลเช็กชื่อ"), {
            status: 403,
          });
        if (!old && r.status !== "PENDING")
          throw Object.assign(
            new Error("การลงทะเบียนใหม่ต้องเริ่มที่รอดำเนินการ"),
            { status: 403 },
          );
      }
      for (const r of incoming.registrations) {
        const old = current.registrations.find((x) => x.id === r.id);
        if (
          (!old && r.status === "PENDING") ||
          (old?.status === "CANCELLED" && r.status === "PENDING")
        ) {
          const w = current.workshops.find((x) => x.id === r.workshopId);
          if (!w || w.closed || Date.parse(w.start) <= Date.now())
            throw Object.assign(new Error("กิจกรรมปิดรับลงทะเบียนแล้ว"), {
              status: 409,
            });
          const occupied =
            current.registrations.filter(
              (x) =>
                x.workshopId === r.workshopId &&
                x.status !== "CANCELLED" &&
                x.userId !== user.id,
            ).length +
            incoming.registrations.filter(
              (x) =>
                x.workshopId === r.workshopId &&
                x.status !== "CANCELLED" &&
                x.userId === user.id,
            ).length;
          if (occupied > Number(w.capacity))
            throw Object.assign(new Error("ที่นั่งเต็มแล้ว"), { status: 409 });
        }
      }
      for (const rating of incoming.ratings) {
        const old = current.ratings.find((x) => x.id === rating.id);
        const reg = incoming.registrations.find(
          (x) => x.id === rating.registrationId,
        );
        if (
          !reg ||
          reg.userId !== user.id ||
          !Number.isInteger(Number(rating.score)) ||
          rating.score < 1 ||
          rating.score > 5 ||
          (old &&
            (old.userId !== rating.userId ||
              old.registrationId !== rating.registrationId))
        )
          throw Object.assign(new Error("แบบประเมินไม่ถูกต้อง"), {
            status: 400,
          });
      }
      for (const c of incoming.complaints) {
        const old = current.complaints.find((x) => x.id === c.id);
        if (old && !equalJson(old, c))
          throw Object.assign(new Error("ผู้ใช้แก้ไขคำร้องที่ส่งแล้วไม่ได้"), {
            status: 403,
          });
        if (!old && (c.status !== "OPEN" || (c.replies || []).length))
          throw Object.assign(
            new Error("คำร้องใหม่ต้องมีสถานะเปิดและไม่มีคำตอบ"),
            { status: 400 },
          );
      }
      for (const n of incoming.notifications) {
        const old = current.notifications.find((x) => x.id === n.id);
        if (
          old &&
          Object.entries(old).some(([k, v]) => k !== "readAt" && n[k] !== v)
        )
          throw Object.assign(new Error("แก้ไขเนื้อหาการแจ้งเตือนไม่ได้"), {
            status: 403,
          });
      }
      const mergeMine = (oldRows, newRows) =>
        oldRows.filter((x) => x.userId !== user.id).concat(newRows);
      incoming = {
        ...current,
        registrations: mergeMine(current.registrations, incoming.registrations),
        ratings: mergeMine(current.ratings, incoming.ratings),
        complaints: mergeMine(current.complaints, incoming.complaints),
        notifications: mergeMine(current.notifications, incoming.notifications),
        revision: incoming.revision,
      };
    }
    return incoming;
  }
  function writeSnapshot(snapshot) {
    const upUser = db.prepare(
      `UPDATE users SET name=?,type=?,code=?,email=?,phone=?,faculty=?,major=?,status=? WHERE id=?`,
    );
    const userExists = db.prepare("SELECT id FROM users WHERE id=?");
    for (const u of snapshot.users)
      if (userExists.get(u.id))
        upUser.run(
          u.name,
          u.type,
          u.code,
          u.email,
          u.phone,
          u.faculty,
          u.major,
          u.status,
          u.id,
        );
    const upWorkshop = db.prepare(
      `INSERT INTO workshops(id,title,description,cover,start_at,end_at,place,capacity,hours,closed,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,cover=excluded.cover,start_at=excluded.start_at,end_at=excluded.end_at,place=excluded.place,capacity=excluded.capacity,hours=excluded.hours,closed=excluded.closed`,
    );
    for (const w of snapshot.workshops)
      upWorkshop.run(
        w.id,
        w.title,
        w.description || "",
        w.cover || "",
        w.start,
        w.end,
        w.place,
        Number(w.capacity),
        Number(w.hours),
        w.closed ? 1 : 0,
        w.createdAt || now(),
      );
    const upReg = db.prepare(
      `INSERT INTO registrations(id,user_id,workshop_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at`,
    );
    for (const r of snapshot.registrations)
      upReg.run(
        r.id,
        r.userId,
        r.workshopId,
        r.status,
        r.createdAt || now(),
        r.updatedAt || now(),
      );
    const upRating = db.prepare(
      `INSERT INTO ratings(id,registration_id,user_id,score,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET score=excluded.score`,
    );
    for (const r of snapshot.ratings) {
      const registrationId = r.registrationId || r.eventId;
      upRating.run(
        r.id,
        registrationId,
        r.userId,
        Number(r.score),
        r.createdAt || now(),
      );
    }
    const upComplaint = db.prepare(
      `INSERT INTO complaints(id,user_id,issue,detail,status,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status`,
    );
    const upReply = db.prepare(
      `INSERT INTO complaint_replies(id,complaint_id,staff_id,message,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET message=excluded.message`,
    );
    for (const c of snapshot.complaints) {
      upComplaint.run(
        c.id,
        c.userId,
        c.issue,
        c.detail || "",
        c.status || "OPEN",
        c.createdAt || now(),
      );
      for (const r of c.replies || [])
        upReply.run(r.id, c.id, r.staffId, r.text, r.createdAt || now());
    }
    const upNotice = db.prepare(
      `INSERT INTO notifications(id,user_id,title,message,related_type,related_id,read_at,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET read_at=excluded.read_at`,
    );
    for (const n of snapshot.notifications)
      upNotice.run(
        n.id,
        n.userId,
        n.title,
        n.message || n.body || "",
        n.relatedType || n.kind || "",
        n.relatedId || n.refId || "",
        n.readAt || null,
        n.createdAt || now(),
      );
  }

  return {
    workshopRows,
    ensureSnapshot,
    viewFromSnapshot,
    mergeSnapshot,
    writeSnapshot,
  };
};
