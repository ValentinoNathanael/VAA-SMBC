import { NextRequest } from "next/server";
import { getObjectBuffer } from "@/lib/s3";

export async function GET(req: NextRequest) {
  try {
    const objectKey = req.nextUrl.searchParams.get("key");

    if (!objectKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "File key is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const buffer = await getObjectBuffer(objectKey);
    const fileName = objectKey.split("/").pop() || "download.xlsx";
    const fileBytes = new Uint8Array(buffer);

    return new Response(fileBytes, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("Download failed:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to download file",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}