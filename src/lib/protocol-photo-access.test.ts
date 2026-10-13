import { describe, expect, it } from "vitest";
import {
  IMAGE_DATA_URI,
  PROTOCOL_PHOTO_ROLES,
  canSeeProtocolPhoto,
  decodeImageDataUri,
  protocolPhotoAccess,
  protocolPhotoHref,
} from "./protocol-photo-access";
import { ROLES } from "./roles";

const serie = { createdById: "pre1" };

describe("protocolPhotoAccess — who sees the photo of the signed protocol (C6)", () => {
  it("lets the reception, the validation (validateur, Direction), the commercial side and the admin see any série", () => {
    for (const role of ["RECEPTIONNISTE", "VALIDATEUR", "DIRECTION", "GESTIONNAIRE", "ADMIN"] as const) {
      expect(protocolPhotoAccess({ id: "someone", role }, serie)).toBe("ALLOWED");
    }
  });

  it("lets a préleveur see their own visit only — 404 for another préleveur's", () => {
    expect(protocolPhotoAccess({ id: "pre1", role: "PRELEVEUR" }, serie)).toBe("ALLOWED");
    expect(protocolPhotoAccess({ id: "pre2", role: "PRELEVEUR" }, serie)).toBe("NOT_FOUND");
  });

  it("never shows it to the blind bench nor to the roles outside sampling and reception", () => {
    for (const role of ["TECHNICIEN", "PROGRAMMATEUR", "COMPTABLE", "MAGASINIER", "CLIENT"] as const) {
      expect(canSeeProtocolPhoto(role)).toBe(false);
      expect(protocolPhotoAccess({ id: "pre1", role }, serie)).toBe("FORBIDDEN");
    }
  });

  it("names every admitted role explicitly, and every role is decided", () => {
    expect([...PROTOCOL_PHOTO_ROLES]).toEqual(["PRELEVEUR", "RECEPTIONNISTE", "VALIDATEUR", "DIRECTION", "GESTIONNAIRE", "ADMIN"]);
    for (const role of ROLES) expect(typeof canSeeProtocolPhoto(role)).toBe("boolean");
  });

  it("links to the one path the validation page also uses", () => {
    expect(protocolPhotoHref("ckserie123")).toBe("/api/series/ckserie123/protocol-photo");
  });
});

describe("decodeImageDataUri — the stored photo served back as an image", () => {
  const png = `data:image/png;base64,${Buffer.from("PNGDATA").toString("base64")}`;

  it("decodes the three accepted types with their content type", () => {
    expect(decodeImageDataUri(png)).toMatchObject({ contentType: "image/png", extension: "png" });
    expect(Buffer.from(decodeImageDataUri(png)!.bytes).toString()).toBe("PNGDATA");
    expect(decodeImageDataUri("data:image/jpeg;base64,QUJD")).toMatchObject({ contentType: "image/jpeg", extension: "jpg" });
    expect(decodeImageDataUri("data:image/jpg;base64,QUJD")).toMatchObject({ contentType: "image/jpeg" });
    expect(decodeImageDataUri("data:image/webp;base64,QUJD")).toMatchObject({ contentType: "image/webp", extension: "webp" });
  });

  it("serves nothing for an absent or a malformed value — the whole string is checked", () => {
    expect(decodeImageDataUri(null)).toBeNull();
    expect(decodeImageDataUri("")).toBeNull();
    expect(decodeImageDataUri("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(decodeImageDataUri("data:text/html;base64,PGI+")).toBeNull();
    expect(decodeImageDataUri("data:image/png;base64,QUJD<script>")).toBeNull();
    expect(decodeImageDataUri(`x${png}`)).toBeNull();
    expect(IMAGE_DATA_URI.test("data:image/png;base64,")).toBe(false);
  });
});
