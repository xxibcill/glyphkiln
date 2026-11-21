/**
 * Glyphkiln's supplement to the ICU dictionary for
 * `thai-segmentation-hybrid@1.0.0`: common words that ICU's `thaidict` leaves
 * out, either loanwords in their usual spelling (โปรโมชั่น, where ICU has
 * โปรโมชัน) or lexicalized compounds that ICU splits into their parts
 * (รายละเอียด, ผลไม้, เครื่องมือ).
 *
 * The list was drawn up from the segmenter's errors on the G-TH draft, so G-TH
 * is not an independent test of it. The native Thai reader reviews it with the
 * draft. It is part of the policy: changing it needs a new policy version, and
 * its hash is in the policy record.
 */
export const THAI_SUPPLEMENT_WORDS: readonly string[] = Object.freeze([
  "กลางแจ้ง",
  "ขั้นต่ำ",
  "ข้อต่อ",
  "ข้อเสนอ",
  "ความจุ",
  "ความยาว",
  "ความรู้",
  "ความลึก",
  "คอมมิชชัน",
  "คอมเมนต์",
  "จัดส่ง",
  "ช้อนโต๊ะ",
  "ตัวเลือก",
  "ติดตั้ง",
  "ต้นกล้า",
  "ทางเดิน",
  "น้ำหนัก",
  "ผลไม้",
  "ผิดปกติ",
  "ผู้ผลิต",
  "พกพา",
  "พรุ่งนี้",
  "พี่น้อง",
  "ภาพจำลอง",
  "ภาพประกอบ",
  "มะเขือเทศ",
  "รับประกัน",
  "รายละเอียด",
  "รูปแบบ",
  "ร้านค้า",
  "วันนี้",
  "สมุดบันทึก",
  "หน่วยงาน",
  "องค์ประกอบ",
  "เก็บเกี่ยว",
  "เข้าเล่ม",
  "เครื่องมือ",
  "เจ้าหน้าที่",
  "เที่ยงคืน",
  "เพิ่มเติม",
  "เริ่มต้น",
  "เรียนรู้",
  "เหรอ",
  "แข็งแรง",
  "แอฟฟิลิเอต",
  "โปรโมชั่น",
  "ได้รับ",
]);
