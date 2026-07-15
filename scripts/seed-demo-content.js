/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Demo content for the central LMS: one complete vertical slice, from a country
 * down to individual quiz questions, plus students and their progress.
 *
 * Usage: npm run seed:demo
 *
 * Why this exists: an empty database is a poor test bed. Two 500s were found on
 * the Students page precisely because nothing had ever run against real rows,
 * and the reporting pages (Reach, Impact, Fees Collection, Tech Downtime, the
 * Student Dashboard tree) are still unexercised because they read studentprogress.
 * This gives those queries something to read.
 *
 * Scope and deliberate omissions:
 *
 * - This is a development and test fixture, NOT pilot content. A customer's real
 *   curriculum replaces it wholesale.
 * - It seeds no media. lessonlearnings point at documents rows whose filenames
 *   do not exist in any bucket, so a lesson will list and open but the video will
 *   not play until EXPO_PUBLIC_RESOURCE_URL points somewhere real and the files
 *   are there. Image and audio question templates are structurally valid and
 *   equally media-less.
 * - Questions cover only the 15 template ids the tablet can actually render
 *   (1-8 and 18-24). Ids 9-17 are offered by the authoring API but have no client
 *   renderer, so seeding them would fabricate content that cannot be displayed.
 *   See docs/question-types-and-lesson-structure.md.
 *
 * Idempotent: fixed UUIDs plus INSERT IGNORE, so re-running changes nothing.
 */
const path = require("path");
const crypto = require("crypto");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const DEMO_PASSWORD = "demo";
const PASSWORD_HASH = md5(DEMO_PASSWORD);

// Stable ids so the seed is idempotent and so tests can reference them.
const ID = {
  country: "b0000000-0000-4000-8000-000000000001",
  school: "b0000000-0000-4000-8000-000000000002",
  standard: "b0000000-0000-4000-8000-000000000003",
  subject: "b0000000-0000-4000-8000-000000000004",
  curriculum: "b0000000-0000-4000-8000-000000000005",
  curriculumcountry: "b0000000-0000-4000-8000-000000000006",
  grade: "b0000000-0000-4000-8000-000000000007",
  level: "b0000000-0000-4000-8000-000000000008",
  lesson1: "b0000000-0000-4000-8000-000000000009",
  lesson2: "b0000000-0000-4000-8000-00000000000a",
  doc1: "b0000000-0000-4000-8000-00000000000b",
  doc2: "b0000000-0000-4000-8000-00000000000c",
  learning1: "b0000000-0000-4000-8000-00000000000d",
  learning2: "b0000000-0000-4000-8000-00000000000e",
  practice1: "b0000000-0000-4000-8000-00000000000f",
  practice2: "b0000000-0000-4000-8000-000000000010",
  quiz1: "b0000000-0000-4000-8000-000000000011",
  quiz2: "b0000000-0000-4000-8000-000000000012",
  teacherUser: "b0000000-0000-4000-8000-000000000013",
  teacher: "b0000000-0000-4000-8000-000000000014",
};

const STUDENTS = [
  { su: "b0000000-0000-4000-8000-000000000020", id: "b0000000-0000-4000-8000-000000000021", username: "demo.sophea", first: "Sophea", last: "Chan", gender: 2 },
  { su: "b0000000-0000-4000-8000-000000000022", id: "b0000000-0000-4000-8000-000000000023", username: "demo.dara", last: "Sok", first: "Dara", gender: 1 },
  { su: "b0000000-0000-4000-8000-000000000024", id: "b0000000-0000-4000-8000-000000000025", username: "demo.bopha", first: "Bopha", last: "Neang", gender: 2 },
];

// questionoptionid is assigned per question in the insert loop below: it must be
// unique across questions, because MatchingDropArea keys its drop targets on it.
const opt = (i, text, correct, extra = {}) => ({
  questionoptionid: null,
  questionoptiontext: text,
  questionoptionvalue: text,
  questionoptioniscorrect: correct,
  questionoptionsequence: i,
  questionoptionistext: true,
  questionoptionisfraction: false,
  questionoptionisstaticfile: false,
  questionoptionfile: null,
  questionassociate: null,
  questionoptionnumeratorisstatic: false,
  questionoptionnumeratorvalue: "",
  questionoptiondenominatorisstatic: false,
  questionoptiondenominatorvalue: "",
  ...extra,
});

/**
 * One question per renderable template. `note` records what a curriculum author
 * would supply that this fixture cannot, so nobody mistakes a media-less render
 * for a bug.
 */
const QUESTIONS = [
  { t: 1,  ident: "DEMO-T01-mcq-single-text",   text: "Which number is larger?",                 options: [opt(1, "7", false), opt(2, "12", true), opt(3, "3", false)] },
  { t: 2,  ident: "DEMO-T02-mcq-single-image",  text: "Tap the triangle.",                        options: [opt(1, "triangle", true), opt(2, "square", false)], note: "needs option images" },
  { t: 3,  ident: "DEMO-T03-mcq-multi-text",    text: "Select every even number.",                options: [opt(1, "2", true), opt(2, "5", false), opt(3, "8", true)] },
  { t: 4,  ident: "DEMO-T04-mcq-multi-image",   text: "Select every shape with four sides.",      options: [opt(1, "square", true), opt(2, "circle", false), opt(3, "rectangle", true)], note: "needs option images" },
  { t: 5,  ident: "DEMO-T05-order-text",        text: "Put these numbers in order, smallest first.", options: [opt(1, "3", true), opt(2, "6", true), opt(3, "9", true)] },
  { t: 6,  ident: "DEMO-T06-order-image",       text: "Put the pictures in the order the story happens.", options: [opt(1, "first", true), opt(2, "second", true), opt(3, "third", true)], note: "needs option images" },
  { t: 7,  ident: "DEMO-T07-associate",         text: "Match each number to its word.",           options: [opt(1, "1", true, { questionassociate: { questionassociatetext: "one", questionassociatefile: null } }), opt(2, "2", true, { questionassociate: { questionassociatetext: "two", questionassociatefile: null } })] },
  { t: 8,  ident: "DEMO-T08-fill-blank",        text: "5 + ___ = 8",                              options: [opt(1, "3", true)], correctvalue: 3 },
  { t: 18, ident: "DEMO-T18-doption1",          text: "Prototype: picture options, variant 1.",   options: [opt(1, "a", true), opt(2, "b", false)], note: "unnamed prototype; needs images" },
  { t: 19, ident: "DEMO-T19-doption3",          text: "Prototype: picture options, variant 3.",   options: [opt(1, "a", true), opt(2, "b", false)], note: "unnamed prototype; needs images" },
  { t: 20, ident: "DEMO-T20-doption4",          text: "Prototype: picture options, variant 4.",   options: [opt(1, "a", true), opt(2, "b", false)], note: "unnamed prototype; needs images" },
  { t: 21, ident: "DEMO-T21-foption1",          text: "Prototype: typed answer, variant 1.",      options: [opt(1, "4", true)], correctvalue: 4, note: "unnamed prototype" },
  { t: 22, ident: "DEMO-T22-foption2",          text: "Prototype: typed answer, variant 2.",      options: [opt(1, "6", true)], correctvalue: 6, note: "unnamed prototype" },
  { t: 23, ident: "DEMO-T23-foption4",          text: "Prototype: typed answer, variant 4.",      options: [opt(1, "9", true)], correctvalue: 9, note: "unnamed prototype" },
  { t: 24, ident: "DEMO-T24-fraction",          text: "Shade one half.",                          options: [opt(1, "1/2", true, { questionoptionisfraction: true, questionoptionnumeratorvalue: "1", questionoptiondenominatorvalue: "2" })] },
];

const qid = (i) => `b0000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`;

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run: NODE_ENV=production. This seeds demo content.");
    process.exit(1);
  }
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  if (!user || password === undefined) {
    console.error("Missing DB_USER or DB_PASSWORD in edtech-lms-api/.env");
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(String(process.env.DB_PORT || "3306"), 10),
    user,
    password,
    database: process.env.DB_NAME || "edtech_lms",
    multipleStatements: false,
  });

  const q = (sql, params = []) => conn.execute(sql, params);

  try {
    await q(`INSERT IGNORE INTO countries (countryid, countryname, isdeleted) VALUES (?,?,0)`,
      [ID.country, "Cambodia"]);

    await q(`INSERT IGNORE INTO schools (schoolid, schoolname, countryid, curriculums, isdeleted, expectedcontribution, expectedusage)
             VALUES (?,?,?,?,0,?,?)`,
      [ID.school, "Demo Primary School", ID.country, JSON.stringify([ID.curriculum]), 25, 40]);

    // students.standard holds the standard's ID, not its name: the list query
    // joins `standards` AS `class` ON students.standard = class.standardid.
    // Putting the display name there leaves the Class and School columns blank.
    await q(`INSERT IGNORE INTO standards (standardid, standardname, schoolname, schoolid, isdeleted) VALUES (?,?,?,?,0)`,
      [ID.standard, "Class 4A", "Demo Primary School", ID.school]);

    await q(`INSERT IGNORE INTO subjects (subjectid, subjectname, subjectstatus, subjectdescription, isdeleted)
             VALUES (?,?,1,?,0)`,
      [ID.subject, "Numeracy", "Demo subject"]);

    await q(`INSERT IGNORE INTO curriculums (curriculumid, curriculumname, curriculumstatus, curriculumdescription, isdeleted, subjectid)
             VALUES (?,?,1,?,0,?)`,
      [ID.curriculum, "Demo Numeracy Curriculum", "Seeded by npm run seed:demo", ID.subject]);

    await q(`INSERT IGNORE INTO curriculumcountry (curriculumcountryid, curriculumid, countryid) VALUES (?,?,?)`,
      [ID.curriculumcountry, ID.curriculum, ID.country]);

    await q(`INSERT IGNORE INTO grades (gradeid, curriculumid, gradestatus, gradename, gradedescription, gradeorder, isdeleted, passing_points, points)
             VALUES (?,?,1,?,?,1,0,80,100)`,
      [ID.grade, ID.curriculum, "Grade 1", "Demo grade"]);

    await q(`INSERT IGNORE INTO levels (levelid, gradeid, levelname, leveldescription, isdeleted, levelstatus, levelorder, passing_points, quiz_points, points)
             VALUES (?,?,?,?,0,1,1,80,20,100)`,
      [ID.level, ID.grade, "Level 1", "Demo level"]);

    const lessons = [
      { id: ID.lesson1, name: "Counting to ten", order: 1, doc: ID.doc1, learning: ID.learning1, practice: ID.practice1, quiz: ID.quiz1 },
      { id: ID.lesson2, name: "Adding small numbers", order: 2, doc: ID.doc2, learning: ID.learning2, practice: ID.practice2, quiz: ID.quiz2 },
    ];

    for (const l of lessons) {
      await q(`INSERT IGNORE INTO lessons (lessonid, levelid, lessonname, lessondescription, practicecount, quizcount, lessonpasspercentage, lessonorder, lessonstatus, isdeleted, total_points, passing_points, learning_points, quizzes_points, practices_points)
               VALUES (?,?,?,?,?,?,80,?,1,0,100,80,20,40,40)`,
        [l.id, ID.level, l.name, "Demo lesson", 1, 1, l.order]);

      // documenttypeid 2 = VIDEO (models/enums/filetype.enum..ts).
      // No file of this name exists in any bucket; see the header note on media.
      await q(`INSERT IGNORE INTO documents (documentid, documenttypeid, documentname, documents3meta, isdeleted, documenttags)
               VALUES (?,?,?,?,0,?)`,
        [l.doc, 2, `demo/${l.name.toLowerCase().replace(/ /g, "-")}.mp4`, JSON.stringify({ seeded: true, media: "absent" }), JSON.stringify(["demo"])]);

      await q(`INSERT IGNORE INTO lessonlearnings (lessonlearningid, lessonlearningname, lessonlearningdescription, lessonlearningstatus, lessonid, documentid, lessonlearningorder, points)
               VALUES (?,?,?,1,?,?,1,20)`,
        [l.learning, `${l.name} video`, "Demo learning video", l.id, l.doc]);

      await q(`INSERT IGNORE INTO lessonpractices (lessonpracticeid, lessonid, lessonpracticeorder, lessonpracticestatus, lessonpracticename, lessonpracticedescription, points)
               VALUES (?,?,1,1,?,?,40)`,
        [l.practice, l.id, `${l.name} practice`, "Demo practice set"]);

      await q(`INSERT IGNORE INTO lessonquizzes (lessonquizid, lessonid, lessonquizorder, lessonquizname, lessonquizstatus, lessonquizdescription, points)
               VALUES (?,?,1,?,1,?,40)`,
        [l.quiz, l.id, `${l.name} quiz`, "Demo quiz"]);
    }

    // Questions: one per renderable template, split across the two lessons.
    for (let i = 0; i < QUESTIONS.length; i++) {
      const Q = QUESTIONS[i];
      const id = qid(i);

      // Give every option an id unique to its question, and point each
      // associate at the option it belongs to (QuestionAssociate.questionoptionid).
      const options = Q.options.map((o, j) => {
        const questionoptionid = `${id}-opt-${j + 1}`;
        return {
          ...o,
          questionoptionid,
          questionassociate: o.questionassociate
            ? { ...o.questionassociate, questionoptionid }
            : null,
        };
      });

      await q(`INSERT IGNORE INTO questions (questionid, questionheading, questionoptions, questiontext, questiondistractors, questionfile, templatetypeid, isdeleted, questionstatus, questionidentifier, questiontags, questioncorrectvalue)
               VALUES (?,?,?,?,?,?,?,0,1,?,?,?)`,
        [
          id,
          JSON.stringify({ headingtext: Q.text, headingfile: null }),
          JSON.stringify(options),
          Q.text,
          JSON.stringify([]),
          null,
          Q.t,
          Q.ident,
          JSON.stringify(Q.note ? ["demo", Q.note] : ["demo"]),
          Q.correctvalue ?? null,
        ]);

      // First half to lesson 1, second half to lesson 2. Each question is used
      // in both the practice and the quiz so both lists are populated.
      const l = i < Math.ceil(QUESTIONS.length / 2) ? lessons[0] : lessons[1];
      await q(`INSERT IGNORE INTO lessonpracticequestions (lessonpracticequestionid, lessonpracticeid, lessonpracticequestionstatus, questionid, lessonpracticequestionorder)
               VALUES (?,?,1,?,?)`,
        [`${id}-p`.slice(0, 36), l.practice, id, i + 1]);
      await q(`INSERT IGNORE INTO lessonquizquestions (lessonquizquestionid, lessonquizid, questionid, lessonquizquestionstatus, lessonquizquestionorder)
               VALUES (?,?,?,1,?)`,
        [`${id}-q`.slice(0, 36), l.quiz, id, i + 1]);
    }

    // Teacher and students. schooluserrole: 3 = teacher, 4 = student
    // (matches edtech-lms-rpi-api/scripts/seed-demo-users.sql and useAuth.ts).
    await q(`INSERT IGNORE INTO schoolusers (schooluserid, schoolusername, schooluserpasswordhash, schooluserrole, schooluserstatus, schoolname, isdisabled)
             VALUES (?,?,?,3,1,?,0)`,
      [ID.teacherUser, "demo.teacher", PASSWORD_HASH, "Demo Primary School"]);
    // students.schoolname is a plain column, not a join: students has no schoolid.
    // The Students list reads it directly, so leaving it out blanks the School column.
    await q(`INSERT IGNORE INTO students (studentid, studentfirstname, studentlastname, genderid, city, country, state, curriculumid, isactive, schooluserid, gradeid, startinglevelid, studentcurrentlevelid, studentcurrentlessonid, standard, schoolname, schooltype, is_teacher_acc)
             VALUES (?,?,?,1,?,?,?,?,1,?,?,?,?,?,?,?,?,1)`,
      [ID.teacher, "Demo", "Teacher", "Phnom Penh", "Cambodia", "Phnom Penh", ID.curriculum, ID.teacherUser, ID.grade, ID.level, ID.level, ID.lesson1, ID.standard, "Demo Primary School", "Public"]);

    for (const s of STUDENTS) {
      await q(`INSERT IGNORE INTO schoolusers (schooluserid, schoolusername, schooluserpasswordhash, schooluserrole, schooluserstatus, schoolname, isdisabled)
               VALUES (?,?,?,4,1,?,0)`,
        [s.su, s.username, PASSWORD_HASH, "Demo Primary School"]);
      await q(`INSERT IGNORE INTO students (studentid, studentfirstname, studentlastname, genderid, city, country, state, curriculumid, isactive, schooluserid, gradeid, startinglevelid, studentcurrentlevelid, studentcurrentlessonid, standard, schoolname, schooltype, is_teacher_acc)
               VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,0)`,
        [s.id, s.first, s.last, s.gender, "Phnom Penh", "Cambodia", "Phnom Penh", ID.curriculum, s.su, ID.grade, ID.level, ID.level, ID.lesson1, ID.standard, "Demo Primary School", "Public"]);
    }

    // Progress. progresstype: 1 = LESSONPRACTICE, 2 = LESSONQUIZ
    // (edtech-lms-rpi-api/src/models/enums/progress.enum.ts).
    // Deliberately mixed pass and fail so the reporting pages have both.
    let n = 0;
    for (const s of STUDENTS) {
      for (const l of lessons) {
        for (const [type, ref] of [[1, l.practice], [2, l.quiz]]) {
          const pass = !(n % 3 === 2); // one in three fails
          const pct = pass ? 90 : 40;
          await q(`INSERT IGNORE INTO studentprogress (studentprogressid, studentid, ispass, studentprogressreferenceid, starttime, endtime, progresstype, resultpercentage, points, fullpoints, marks, scores)
                   VALUES (?,?,?,?, DATE_SUB(NOW(), INTERVAL ? DAY), DATE_SUB(NOW(), INTERVAL ? DAY), ?,?,?,?,?,?)`,
            [`b0000000-0000-4000-8000-0000000002${String(n).padStart(2, "0")}`, s.id, pass ? 1 : 0, ref, n + 1, n + 1, type, pct, pass ? 40 : 10, 40, pass ? 9 : 4, pass ? 2 : 0]);
          n++;
        }
      }
    }

    const [[counts]] = await conn.query(`
      SELECT (SELECT COUNT(*) FROM students)        AS students,
             (SELECT COUNT(*) FROM lessons)         AS lessons,
             (SELECT COUNT(*) FROM questions)       AS questions,
             (SELECT COUNT(*) FROM studentprogress) AS progress`);

    console.log("Demo content seeded.");
    console.log(`  students ${counts.students} | lessons ${counts.lessons} | questions ${counts.questions} | progress rows ${counts.progress}`);
    console.log(`  teacher login: demo.teacher / ${DEMO_PASSWORD}`);
    console.log(`  students:      ${STUDENTS.map((s) => s.username).join(", ")} / ${DEMO_PASSWORD}`);
    console.log("  No media is seeded: lesson videos will not play until EXPO_PUBLIC_RESOURCE_URL");
    console.log("  points at a real host holding the files these documents rows name.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
