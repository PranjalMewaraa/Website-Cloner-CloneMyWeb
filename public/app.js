const form = document.getElementById("clone-form");
const submitBtn = document.getElementById("submit-btn");
const urlInput = document.getElementById("url");
const progress = document.getElementById("progress");
const steps = Array.from(document.querySelectorAll("#steps li"));
const barFill = document.getElementById("bar-fill");
const result = document.getElementById("result");
const downloadLink = document.getElementById("download-link");
const resetBtn = document.getElementById("reset-btn");
const errorEl = document.getElementById("error");

let stepTimer = null;
let downloadObjectUrl = null;

function setError(message) {
  if (!message) {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
    return;
  }
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

function resetSteps() {
  steps.forEach((el) => el.className = "");
  barFill.style.width = "0%";
}

function markStep(index) {
  const total = steps.length;
  for (let i = 0; i < total; i += 1) {
    if (i < index) steps[i].className = "done";
    else if (i === index) steps[i].className = "active";
    else steps[i].className = "";
  }
  const progressValue = Math.round(((index + 1) / total) * 100);
  barFill.style.width = `${progressValue}%`;
}

function startProgressAnimation() {
  let current = 0;
  markStep(current);
  stepTimer = setInterval(() => {
    if (current < steps.length - 1) {
      current += 1;
      markStep(current);
    }
  }, 900);
}

function stopProgressAnimation(success) {
  if (stepTimer) {
    clearInterval(stepTimer);
    stepTimer = null;
  }
  if (success) {
    markStep(steps.length - 1);
  }
}

function startLoadingState() {
  setError("");
  result.classList.add("hidden");
  progress.classList.remove("hidden");
  resetSteps();
  startProgressAnimation();
  submitBtn.disabled = true;
  submitBtn.textContent = "Cloning...";
}

function endLoadingState() {
  submitBtn.disabled = false;
  submitBtn.textContent = "Clone Website";
}

function getFilenameFromHeaders(headers) {
  const cd = headers.get("content-disposition") || "";
  const match = cd.match(/filename\\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const raw = match?.[1] || match?.[2];
  return raw ? decodeURIComponent(raw) : `clonex-${Date.now()}.zip`;
}

function clearDownloadUrl() {
  if (downloadObjectUrl) {
    URL.revokeObjectURL(downloadObjectUrl);
    downloadObjectUrl = null;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const url = urlInput.value.trim();
  if (!url) {
    setError("Please enter a URL.");
    return;
  }

  startLoadingState();
  clearDownloadUrl();

  try {
    const response = await fetch("/clone/direct-download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      let message = `Clone failed (${response.status})`;
      try {
        const data = await response.json();
        message = data.error || message;
      } catch {
        // ignore parsing errors
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const fileName = getFilenameFromHeaders(response.headers);

    downloadObjectUrl = URL.createObjectURL(blob);
    downloadLink.href = downloadObjectUrl;
    downloadLink.download = fileName;

    stopProgressAnimation(true);
    result.classList.remove("hidden");
    downloadLink.click();
  } catch (error) {
    stopProgressAnimation(false);
    setError(error.message || "Clone failed.");
  } finally {
    endLoadingState();
  }
});

resetBtn.addEventListener("click", () => {
  form.reset();
  setError("");
  result.classList.add("hidden");
  progress.classList.add("hidden");
  resetSteps();
  clearDownloadUrl();
  urlInput.focus();
});
