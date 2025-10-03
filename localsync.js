const fs = require("fs");
const { chunk } = require("lodash");
const download = require("download");
const fse = require("fs-extra");
const start = async () => {
  try {
    const date = "09032022";
    const curriculum = "Cambodia";
    const lstError = [];
    const filelist = await fs.promises.readFile(`./${curriculum}.json`);
    const chunkData = chunk(JSON.parse(filelist.toString()), 10);

    for (const chunk of chunkData) {
      await Promise.all(
        chunk.map((x) =>
          fse
            .copy(
              `D:\\fortyk\\content\\${date}\\content\\${x}`,
              `D:\\fortyk\\content\\${date}\\${curriculum}\\${x}`
            )
            .catch((e) => lstError.push(x))
        )
      );
    }
    await fs.promises.writeFile(
      `D:\\fortyk\\content\\${date}\\${curriculum}-missing.json`,
      JSON.stringify(lstError)
    );
    console.log("done");
  } catch (e) {
    console.log(e);
    throw e;
  }
};

start()
  .then()
  .catch((x) => console.log(x));
