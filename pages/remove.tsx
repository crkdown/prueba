import Head from "next/head";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useS3Upload } from "next-s3-upload";
import Upload, { CustomFile } from "@/components/Upload";
import Modal from "@/components/Modal";
import { collection, setDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import useAuth from "@/hooks/useAuth";
import usePackage from "@/hooks/usePackage";
import { registerOrLogin } from "@/lib/auth";
import Link from "next/link";
import UsageBar from "@/components/UsageBar";
import Hero from "@/components/Hero";
import Spinner from "@/components/Spinner";
import downloadPhoto, { appendNewToName } from "@/lib/download";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function RemoveBackground() {
  const [localFile, setLocalFile] = useState<CustomFile>();
  const [s3FileUrl, setS3FileUrl] = useState<string>();
  const [prediction, setPrediction] = useState<any>(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [removedBgLoaded, setRemovedBgLoaded] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [photoName, setPhotoName] = useState<string | null>(null);

  const { user } = useAuth();
  const { used, limit, incrementFreeUsed } = usePackage();

  const [setImageDimensions, imageDimensions] = useState<{
    width: number;
    height: number;
  }>();

  let { uploadToS3 } = useS3Upload();

  const handleUpload = async (file: File) => {
    if (used === limit) {
      setShowLoginModal(true);
      return;
    }

    setLoading(true);

    setPhotoName(file.name);

    setLocalFile(
      Object.assign(file, {
        preview: URL.createObjectURL(file),
      })
    );

    let { url } = await uploadToS3(file);
    setS3FileUrl(url);
    // let { height, width } = await getImageData(file);

    const response = await fetch("/api/predictions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: url,
      }),
    });

    let prediction = await response.json();

    if (response.status !== 201) {
      console.log("prediction errror", prediction.detail);
      setError(prediction.detail);
      setLoading(false);
      return;
    }

    setPrediction(prediction);

    while (
      prediction.status !== "succeeded" &&
      prediction.status !== "failed"
    ) {
      await sleep(1000);
      const response = await fetch("/api/predictions/" + prediction.id);
      prediction = await response.json();

      if (response.status !== 200) {
        setError(prediction.detail);
        setLoading(false);
        return;
      }

      setPrediction(prediction);
      setLoading(false);
    }

    if (user) {
      // Save prediction in firestore
      const predictionsRef = collection(db, "predictions");
      await setDoc(doc(predictionsRef), {
        input: url,
        output: prediction.output,
        profile: user.id,
        "_createdBy.timestamp": new Date(),
      });
    } else {
      incrementFreeUsed();
    }
  };

  useEffect(() => {
    // Make sure to revoke the data uris to avoid memory leaks, will run on unmount
    return () => localFile && URL.revokeObjectURL(localFile.preview);
  }, []);

  return (
    <>
      <Head>
        <title>Remove Background</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="mt-12">
        <Hero
          heading="Remove background"
          subHeading="Upload your photo and watch the magic happen."
        />
      </div>

      <div className="my-16 flex gap-12">
        <div className="flex-1">
          <h1 className="mb-5 text-2xl">Upload</h1>
          {localFile && (
            <Image
              alt="uploaded photo"
              src={localFile.preview}
              className="relative mt-2 mb-4 rounded-2xl  sm:mt-0"
              width={475}
              height={475}
            />
          )}

          {!removedBgLoaded && <Upload onUpload={handleUpload} />}

          {removedBgLoaded && (
            <div className="text-center">
              <button
                className="cursor-pointer rounded-sm bg-black py-2 px-6 text-white hover:text-zinc-300"
                onClick={() => {
                  setLocalFile(undefined);
                  setS3FileUrl(undefined);
                  setRemovedBgLoaded(false);
                  setError(null);
                  setPrediction(undefined);
                }}
              >
                Upload New Photo
              </button>
            </div>
          )}

          <div className="mt-5">
            <UsageBar />
          </div>
        </div>
        <div className="flex-1">
          <h1 className="mb-5 text-2xl">Result</h1>

          {loading && (
            <div className="flex justify-center">
              <Spinner />
            </div>
          )}

          {prediction && (
            <div>
              {prediction.output && (
                <>
                  {!removedBgLoaded && (
                    <div className="justify-centertext-center flex w-full flex-col items-center">
                      <Spinner />
                      <p className="text-lg text-zinc-700">
                        Adding final touches...
                      </p>
                    </div>
                  )}
                  <Image
                    src={prediction.output}
                    alt="output"
                    className="relative mt-2 mb-4 rounded-2xl sm:mt-0"
                    width={475}
                    height={475}
                    onLoadingComplete={() => setRemovedBgLoaded(true)}
                  />
                </>
              )}
            </div>
          )}
          {removedBgLoaded && (
            <div className="text-center">
              <button
                className="cursor-pointer rounded-sm border border-black py-2 px-6  hover:bg-black hover:text-zinc-300"
                onClick={() => {
                  downloadPhoto(
                    prediction.output!,
                    appendNewToName(photoName!)
                  );
                }}
              >
                Download Photo
              </button>
            </div>
          )}
        </div>
        <Modal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          title={
            user ? "Purchase more credits to continue" : "Sign in to continue"
          }
        >
          <div className="py-4">
            <div className="mb-8 text-center">
              <p className="font-semibold">
                Oh oh, you&apos;ve used up all your credits.
              </p>
              {!user && (
                <p>
                  Good news is by signing up you get an additional 100 free
                  credits!
                </p>
              )}
            </div>

            <div className="text-center">
              {!user && (
                <button
                  className="cursor-pointer rounded-sm bg-black py-2 px-8 text-white hover:text-zinc-300"
                  onClick={async () => {
                    const { user } = await registerOrLogin();
                    if (user) {
                      setShowLoginModal(false);
                    }
                  }}
                >
                  Sign in with Google
                </button>
              )}
              {user && (
                <Link href="/dashboard">
                  <button className="cursor-pointer rounded-sm bg-black py-2 px-8 text-white hover:text-zinc-300">
                    Buy credits
                  </button>
                </Link>
              )}
            </div>
          </div>
        </Modal>
      </div>
    </>
  );
}
