import { useRef } from "react";

const Upload = ({ setImg, renderCustom, onSuccessCallback }) => {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const onFileChange = async (evt) => {
    const file = evt.target.files[0];
    if (!file) return;
    evt.target.value = "";

    // 1. Show local preview instantly
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64DataUri = reader.result;

      setImg({
        isLoading: true,
        error: "",
        rawFile: file,
        localPreview: base64DataUri,
        persistentUrl: null,
        dbData: { filePath: null },
        aiData: {
          inlineData: {
            data: base64DataUri.split(",")[1],
            mimeType: file.type,
          },
        },
      });

      // 2. Upload to Cloudinary in background
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/upload-image`,
          { method: "POST", body: formData },
        );
        const data = await res.json();

        if (data.success) {
          setImg((prev) => ({
            ...prev,
            isLoading: false,
            persistentUrl: data.url,
          }));
          console.log("✅ Cloudinary URL:", data.url);
        } else {
          setImg((prev) => ({ ...prev, isLoading: false }));
        }
      } catch (err) {
        console.warn("Upload failed, using base64 fallback:", err);
        setImg((prev) => ({ ...prev, isLoading: false }));
      } finally {
        if (onSuccessCallback) onSuccessCallback(); // still fires after either branch
      }
    };
    reader.readAsDataURL(file);
  };

  const trigger = (type = "gallery") => {
    if (type === "camera") {
      cameraRef.current?.click();
    } else {
      galleryRef.current?.click();
    }
  };

  return (
    <div className="upload-container">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileChange}
        style={{ display: "none" }}
        ref={cameraRef}
      />
      <input
        type="file"
        accept="image/*"
        onChange={onFileChange}
        style={{ display: "none" }}
        ref={galleryRef}
      />
      {renderCustom ? (
        renderCustom(trigger)
      ) : (
        <label onClick={() => trigger("gallery")} style={{ cursor: "pointer" }}>
          <img src="/attachment1.png" alt="Upload" />
        </label>
      )}
    </div>
  );
};

export default Upload;
