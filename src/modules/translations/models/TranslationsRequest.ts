import { ApiProperty } from "@nestjs/swagger";

export class TranslationsPutRequest {
  @ApiProperty({ description: "2 to 8 letters, digits and hyphens (km, en, pt-BR). Kept as its primary subtag in lower case. Not the organisation's own content language." })
  language: string;
  @ApiProperty({
    type: "object",
    additionalProperties: { type: "string" },
    description:
      'The texts, by name: "<field>" for a text of the row ("lessonname"), "<field>.<id>" for a text inside a question ("questionoptiontext.<option id>", "questionassociatetext.<option id>", "questiondistractortext.<distractor id>", "feedback.correctmessage" or "feedback.incorrectmessage"). A text an answer is graded by is refused.',
  })
  fields: Record<string, string>;

  constructor() {
    this.language = "";
    this.fields = {};
  }
}
