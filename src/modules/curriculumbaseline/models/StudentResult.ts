export interface IStudentBaselineResult {
  student: string;
  username: string;
  schoolname: string;
  baselinename: string;
  ispass: string;
  starttime?: string;
  endtime?: string;
  resultpercentage: number;
  correct: number;
  totalquestions: number;
  scores: number;
}
