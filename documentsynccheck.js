const fs = require("fs");
const { chunk } = require("lodash");
const download = require("download");

const start = async () => {
  try {
    const lstError = [];
    const filelist = await fs.promises.readFile("./temp.json");
    const chunkData = chunk(JSON.parse(filelist.toString()), 10);
    const date = "25022022";
    const curriculum = "Cambodia";
    for (const chunk of chunkData) {
      await Promise.all(
        chunk.map((x) =>
          fs.promises
            .stat(`./documentassets/${date}/${curriculum}/${x}`)
            .catch((e) => lstError.push(x))
        )
      );
    }
    await fs.promises.writeFile(
      `./documentassets/${date}/${curriculum}-missing.json`,
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
