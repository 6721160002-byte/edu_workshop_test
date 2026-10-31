# แก้ไข Dropdown ของ BSRU Workshop

Dropdown ของฟอร์มและตัวกรองใช้ `<select>` จริง จึงใช้คีย์บอร์ด ป้ายกำกับ การตรวจฟอร์ม และส่งค่าตามเดิม สไตล์กลางครอบคลุมทุก `<select>` แบบเลือกค่าเดียวที่ไม่มี `size` รวมถึงตัวเลือกใน Modal และส่วนที่สร้างเพิ่มภายหลัง

## ต้องแก้ไฟล์ไหน

| สิ่งที่ต้องการเปลี่ยน                               | ไฟล์ / จุดค้นหา                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| สี มุมโค้ง เงา ความสูง และระยะห่างของ Dropdown      | `public/assets/css/dropdowns.css`                                                            |
| ความเร็วและจังหวะ Animation                         | ตัวแปร `--dropdown-fast`, `--dropdown-duration`, `--dropdown-ease` ด้านบนของ `dropdowns.css` |
| หน้าตารายการ ตอนชี้เมาส์ ตอนเลือก และเครื่องหมายถูก | กฎ `option`, `option:checked`, `option::checkmark` ใน `dropdowns.css`                        |
| Animation ของเมนูรูปผู้ใช้                          | ส่วน `.account-dropdown` และ `.account-menu-group` ใน `dropdowns.css`                        |
| ชื่อตัวเลือก / ค่าในตัวกรองสถานะกิจกรรม             | `public/assets/js/app.js` ค้นหา `id="phase-filter"` ในฟังก์ชัน `workshops()`                 |
| รายการคณะและสาขา                                    | `public/assets/js/app.js` ค้นหา `const PROGRAMS`                                             |
| รายการปัญหาที่แจ้งได้                               | `public/assets/js/app.js` ค้นหา `const issues`                                               |
| รายการในเมนูรูปผู้ใช้                               | `public/assets/js/app.js` ฟังก์ชัน `accountMenu()`                                           |
| ผลที่เกิดหลังเลือกค่า                               | `public/assets/js/app.js` ค้นหา `document.addEventListener("change"`                         |
| เพิ่ม / เอาไฟล์สไตล์ออก                             | `public/index.html` บรรทัด `<link>` ที่โหลด `dropdowns.css` หลัง `premium.css`               |

ตัวอย่างปรับธีม แก้ค่าที่ `:root` ด้านบนของ `dropdowns.css`:

```css
--dropdown-accent: #854c9e; /* สีหลัก / กรอบเมื่อเปิด */
--dropdown-selected: #efe3f7; /* พื้นหลังตัวเลือกที่เลือกแล้ว */
--dropdown-radius: 14px; /* มุมโค้งช่องเลือก */
--dropdown-duration: 220ms; /* ระยะเวลาเปิด / ปิด */
```

## หน้าจัดการเวิร์กช็อปที่มีรายการจำนวนมาก

- `public/assets/js/app.js`: แก้ชื่อและลำดับสถานะที่ `managementStatuses`, เงื่อนไขค้นหา/กรอง/เรียงที่ `managedWorkshops()`, แถวตารางที่ `managementTable()` และการแบ่งหน้าที่ `managementPagination()`
- `public/assets/css/management.css`: แก้การจัดวางช่องค้นหา ตัวกรอง แถวตาราง เมนู `⋯` และส่วนแบ่งหน้า โดยสไตล์ Dropdown เองยังใช้ `dropdowns.css`
- ค่าเริ่มต้นใน `state`: `managePageSize: 10` และ `manageSort: "priority"` ตัวเลือกจำนวนแถวมี 10/25/50 ทั้งใน `managementPagination()` และตัวจัดการ `change` ของ `manage-page-size`
- เมื่อเลือกทุกสถานะและเรียงตามสถานะ ระบบจะแบ่งหัวกลุ่มและแสดงงานกำลังดำเนินการ/ใกล้เริ่มก่อน เมื่อเลือกสถานะเดียวจะไม่ซ้ำสถานะทุกแถว ส่วนการเรียงตามวันเริ่มจะแสดงสถานะใต้ชื่อแต่ละรายการเมื่อเลือกทุกสถานะ
- ส่วนนี้แบ่งหน้าข้อมูลที่โหลดมาในหน้าเว็บแล้ว สำหรับหลักสิบถึงหลักร้อยรายการ ไม่ได้เปลี่ยน API หรือเพิ่มการแบ่งหน้าที่ฐานข้อมูล
- ปุ่มสลับ “กิจกรรมปัจจุบัน” / “ประวัติการลบ” ใช้ `state.manageView` แยกจากตัวกรองสถานะ ปุ่มใช้ `data-action="manage-view"` เมื่อสลับจะล้างคำค้นหา/วันที่และกลับหน้าแรก ส่วน “ล้างตัวกรอง” จะคงมุมมองที่เปิดอยู่ไว้
- Dropdown สถานะมีเฉพาะสถานะกิจกรรมปัจจุบัน ไม่มีตัวเลขซ้ำในแต่ละตัวเลือก จำนวนผลลัพธ์แสดงที่หัวรายการ ในมุมมองประวัติจะซ่อน Dropdown สถานะ
- “ประวัติการลบ” อ่านจากรายการ `delete` ของ `workshops` ใน `auditLog` ไม่รวมในจำนวนกิจกรรมปัจจุบัน ดู UI ได้ที่ `deletedWorkshopsTable()` และ `deletedWorkshopDetail()` การลบครั้งใหม่บันทึกชื่อ วันจัด สถานที่ จำนวนที่นั่ง/ผู้สมัคร ชั่วโมง ผู้ลบ และเวลาลบจากเซิร์ฟเวอร์ใน `src/routes.js` รายการเก่าที่มีเฉพาะรหัสจะระบุว่าเป็นบันทึกเก่า

## เพิ่มตัวเลือกใน Dropdown เดิม

ตัวอย่างใน `phase-filter`:

```js
["all", "ทั้งหมด"],
["upcoming", "เร็วๆ นี้"],
```

ข้อความด้านขวาเป็นสิ่งที่แสดงบนหน้าเว็บ ส่วนค่าด้านซ้ายใช้กรองข้อมูล ถ้าเพิ่มสถานะใหม่ต้องแก้เงื่อนไขกรองและกติกาข้อมูลที่เกี่ยวข้องด้วย การเปลี่ยนเฉพาะชื่อที่แสดงไม่ต้องแก้ CSS

## เพิ่ม Dropdown ใหม่

เพิ่ม `<select>` ตามปกติในฟอร์มหรือหน้าที่สร้างจาก `app.js` ไม่ต้องเพิ่ม JavaScript สำหรับเปิด/ปิดเมนู:

```html
<label for="example-status">สถานะ</label>
<select id="example-status" name="status">
  <option value="all">ทั้งหมด</option>
  <option value="active">เปิดใช้งาน</option>
</select>
```

ใส่ `name` เมื่อเป็นข้อมูลที่ต้องส่งจากฟอร์ม และใช้ `label` หรือ `aria-label` ให้ชัดเจน หลีกเลี่ยงการแก้สีหรือ Animation ซ้ำเป็นรายหน้า เพื่อให้ Dropdown ใหม่ใช้สไตล์ร่วมกัน

## การรองรับเบราว์เซอร์และ Motion

เมนูตัวเลือกที่ปรับแต่งและเคลื่อนไหวใช้ `appearance: base-select` ภายใน `@supports` เบราว์เซอร์ที่รองรับจะใช้เมนูแบบใหม่ ส่วนเบราว์เซอร์ที่ยังไม่รองรับจะใช้รายการตัวเลือกของระบบและยังเลือกค่าได้ตามปกติ เมนูอยู่ใน top layer ของเบราว์เซอร์ จึงไม่ถูกขอบ Modal ตัด

เมื่อผู้ใช้ตั้ง Reduce motion จะปิดการเคลื่อนไหว แต่ยังแสดงกรอบ โทนสี และเครื่องหมายเลือกชัดเจน แถบเลื่อนยังซ่อนตามการตั้งค่ากลางของโปรเจกต์ และเลื่อนรายการยาวด้วยเมาส์ สัมผัส หรือคีย์บอร์ดได้

อ้างอิงวิธีทำ: [Chrome — Branded Select Styling](https://developer.chrome.com/docs/modern-web-guidance/guides/forms/branded-select-styling) และ [Animated Select Picker](https://developer.chrome.com/docs/modern-web-guidance/guides/forms/animated-select-picker)
