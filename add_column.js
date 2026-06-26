import { createClient } from '@libsql/client';

const client = createClient({
  url: "file:C:/MunegonDB/dev.db"
});

async function main() {
  try {
    await client.execute("ALTER TABLE Venta ADD COLUMN esCobroDeuda BOOLEAN DEFAULT false;");
    console.log("Column added successfully.");
  } catch (e) {
    if (e.message.includes("duplicate column name")) {
      console.log("Column already exists.");
    } else {
      console.log("Error:", e.message);
    }
  }
}

main();
