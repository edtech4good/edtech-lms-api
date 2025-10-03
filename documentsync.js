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
          download(
            `${process.env.FILE_SERVER_BASE_URL}/${x}`, // Replace process.env.FILE_SERVER_BASE_URL with your LMS file server URL
            `./documentassets/${date}/${curriculum}/`
          ).catch((e) => lstError.push(e))
        )
      );
    }
    await fs.promises.writeFile(`./documentassets/${date}/${curriculum}-missing.json`, JSON.stringify(lstError));
    console.log("done");
  } catch (e) {
    console.log(e);
    throw e;
  }
};

start()
  .then()
  .catch((x) => console.log(x));
