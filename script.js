import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, getDoc, setDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyD8oLB_W2GoiXXQCr6wQyBlKc4I7vpFQQM",
    authDomain: "bloc-de-la-universidad-del-su.firebaseapp.com",
    projectId: "bloc-de-la-universidad-del-su",
    storageBucket: "bloc-de-la-universidad-del-su.firebasestorage.app",
    messagingSenderId: "814092933337",
    appId: "1:814092933337:web:ee3e0b56057415708646c8",
    measurementId: "G-QBX16WGN2B"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

const SUPREME_MODERATOR_EMAIL = "jose.ignacio.ramirez.lizarraga@gmail.com";

let currentUser = null;
let allPhotos = [];
let currentActivePhotoId = null;

const photoGrid = document.getElementById("photoGrid");
const statusToast = document.getElementById("statusToast");
const btnLogin = document.getElementById("btnLogin");
const headerUserName = document.getElementById("headerUserName");
const headerUserAvatar = document.getElementById("headerUserAvatar");
const btnOpenUpload = document.getElementById("btnOpenUpload");
const uploadModal = document.getElementById("uploadModal");
const lightboxModal = document.getElementById("lightboxModal");
const profileModal = document.getElementById("profileModal");
const uploadForm = document.getElementById("uploadForm");
const fileInput = document.getElementById("fileInput");
const imagePreview = document.getElementById("imagePreview");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const photoDescription = document.getElementById("photoDescription");
const searchInput = document.getElementById("searchInput");
const navProfile = document.getElementById("navProfile");
const navModeration = document.getElementById("navModeration");
const btnSaveProfile = document.getElementById("btnSaveProfile");
const inputNewName = document.getElementById("inputNewName");
const modalProfileAvatar = document.getElementById("modalProfileAvatar");
const nameCooldownNotice = document.getElementById("nameCooldownNotice");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxAvatar = document.getElementById("lightboxAvatar");
const lightboxAuthorName = document.getElementById("lightboxAuthorName");
const lightboxDate = document.getElementById("lightboxDate");
const lightboxDesc = document.getElementById("lightboxDesc");
const btnViewFullSize = document.getElementById("btnViewFullSize");
const btnDeletePhoto = document.getElementById("btnDeletePhoto");

function showToast(msg, isError = false) {
    statusToast.textContent = msg;
    statusToast.style.display = "block";
    statusToast.style.background = isError ? "#fce8e6" : "#e8f0fe";
    statusToast.style.color = isError ? "#a50e0e" : "#174ea6";
    setTimeout(() => {
        statusToast.style.display = "none";
    }, 4000);
}

function isSupremeMod(user) {
    return Boolean(user && user.email && user.email.toLowerCase() === SUPREME_MODERATOR_EMAIL.toLowerCase());
}

btnLogin.addEventListener("click", async () => {
    try {
        if (!currentUser) {
            await signInWithPopup(auth, googleProvider);
        } else {
            await signOut(auth);
        }
    } catch (error) {
        console.error("Error de autenticación:", error);
        showToast("Error al iniciar/cerrar sesión. Revisa dominios autorizados en Firebase.", true);
    }
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        btnLogin.textContent = "Cerrar sesión";
        navModeration.style.display = isSupremeMod(user) ? "flex" : "none";
        await checkOrCreateUserProfile(user);
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const profileName = userSnap.exists() && userSnap.data().displayName ? userSnap.data().displayName : (user.displayName || "Estudiante");
        headerUserName.textContent = profileName;
        headerUserAvatar.src = user.photoURL || "https://via.placeholder.com/40";
    } else {
        currentUser = null;
        headerUserName.textContent = "Invitado";
        headerUserAvatar.src = "https://via.placeholder.com/40";
        btnLogin.textContent = "Acceder";
        navModeration.style.display = "none";
    }
    loadPhotos();
});

async function checkOrCreateUserProfile(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
        await setDoc(userRef, {
            displayName: user.displayName || "Estudiante",
            photoURL: user.photoURL || "",
            lastNamedChange: null
        });
    }
}

navProfile.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!currentUser) {
        showToast("Inicia sesión con Google para editar tu perfil.", true);
        return;
    }
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
        const data = userSnap.data();
        inputNewName.value = data.displayName || currentUser.displayName || "";
        modalProfileAvatar.src = currentUser.photoURL || "https://via.placeholder.com/80";

        if (data.lastNamedChange && typeof data.lastNamedChange.toDate === "function") {
            const lastChangeDate = data.lastNamedChange.toDate();
            const daysPassed = (Date.now() - lastChangeDate.getTime()) / (1000 * 60 * 60 * 24);
            if (daysPassed < 10) {
                const daysRemaining = Math.ceil(10 - daysPassed);
                nameCooldownNotice.textContent = `Faltan ${daysRemaining} día(s) para volver a cambiar tu nombre.`;
                inputNewName.disabled = true;
                btnSaveProfile.disabled = true;
            } else {
                nameCooldownNotice.textContent = "Puedes actualizar tu nombre (1 vez cada 10 días).";
                inputNewName.disabled = false;
                btnSaveProfile.disabled = false;
            }
        } else {
            nameCooldownNotice.textContent = "Puedes actualizar tu nombre por primera vez.";
            inputNewName.disabled = false;
            btnSaveProfile.disabled = false;
        }
    }
    profileModal.classList.add("open");
});

btnSaveProfile.addEventListener("click", async () => {
    if (!currentUser) return;
    const newName = inputNewName.value.trim();
    if (!newName) {
        showToast("El nombre no puede estar vacío.", true);
        return;
    }
    const userRef = doc(db, "users", currentUser.uid);
    await setDoc(userRef, {
        displayName: newName,
        lastNamedChange: serverTimestamp()
    }, { merge: true });

    headerUserName.textContent = newName;
    profileModal.classList.remove("open");
    showToast("Nombre actualizado con éxito.");
});

btnOpenUpload.addEventListener("click", () => {
    if (!currentUser) {
        showToast("Debes iniciar sesión con Google para subir fotos.", true);
        return;
    }
    uploadModal.classList.add("open");
});

document.querySelectorAll(".close-modal").forEach(btn => {
    btn.addEventListener("click", () => {
        uploadModal.classList.remove("open");
        profileModal.classList.remove("open");
    });
});

document.querySelector(".lightbox-close").addEventListener("click", () => {
    lightboxModal.classList.remove("open");
});

[uploadModal, profileModal].forEach(modal => {
    modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.remove("open");
    });
});

lightboxModal.addEventListener("click", (e) => {
    if (e.target === lightboxModal) lightboxModal.classList.remove("open");
});

fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            imagePreview.src = event.target.result;
            imagePreviewContainer.classList.add("visible");
        };
        reader.readAsDataURL(file);
    }
});

uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const file = fileInput.files[0];
    const desc = photoDescription.value.trim();
    if (!file || !desc) return;

    const submitBtn = document.getElementById("btnSubmitPhoto");
    submitBtn.textContent = "Subiendo recuerdo...";
    submitBtn.disabled = true;

    try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storageRef = ref(storage, `comunicasur/${Date.now()}_${safeName}`);
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);

        const userSnap = await getDoc(doc(db, "users", currentUser.uid));
        const authorName = (userSnap.exists() && userSnap.data().displayName) || currentUser.displayName || "Estudiante";

        await addDoc(collection(db, "photos"), {
            imageUrl: downloadURL,
            description: desc,
            authorName,
            authorUid: currentUser.uid,
            authorAvatar: currentUser.photoURL || "https://via.placeholder.com/40",
            createdAt: serverTimestamp()
        });

        uploadModal.classList.remove("open");
        uploadForm.reset();
        imagePreviewContainer.classList.remove("visible");
        showToast("Foto publicada en el blog.");
        await loadPhotos();
    } catch (error) {
        console.error("Error al subir foto:", error);
        showToast("Error al subir la foto. Verifica permisos de Storage/Firestore.", true);
    } finally {
        submitBtn.textContent = "Publicar en el Blog";
        submitBtn.disabled = false;
    }
});

async function loadPhotos() {
    try {
        const q = query(collection(db, "photos"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        allPhotos = [];
        querySnapshot.forEach((docSnap) => {
            allPhotos.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderPhotos(allPhotos);
    } catch (error) {
        console.error("Error cargando fotos:", error);
        renderPhotos([]);
    }
}

function renderPhotos(photosToRender) {
    photoGrid.innerHTML = "";
    if (photosToRender.length === 0) {
        photoGrid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:#5f6368; padding: 40px;">No hay fotos aún. ¡Sube la primera!</p>`;
        return;
    }

    photosToRender.forEach(photo => {
        const card = document.createElement("div");
        card.className = "photo-card";

        const imgWrap = document.createElement("div");
        imgWrap.className = "photo-card-img-wrap";
        const img = document.createElement("img");
        img.src = photo.imageUrl || "";
        img.alt = photo.description || "Recuerdo comunicación";
        img.loading = "lazy";
        imgWrap.appendChild(img);

        const footer = document.createElement("div");
        footer.className = "photo-card-footer";
        const avatar = document.createElement("img");
        avatar.src = photo.authorAvatar || "https://via.placeholder.com/40";
        avatar.alt = photo.authorName || "Autor";

        const meta = document.createElement("div");
        meta.className = "photo-card-meta";
        const h5 = document.createElement("h5");
        h5.textContent = photo.authorName || "Estudiante";
        const p = document.createElement("p");
        const descText = photo.description || "";
        p.textContent = descText.length > 35 ? `${descText.slice(0, 35)}...` : descText;

        meta.append(h5, p);
        footer.append(avatar, meta);
        card.append(imgWrap, footer);
        card.addEventListener("click", () => openLightbox(photo));
        photoGrid.appendChild(card);
    });
}

searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allPhotos.filter(p =>
        (p.description || "").toLowerCase().includes(term) ||
        (p.authorName || "").toLowerCase().includes(term)
    );
    renderPhotos(filtered);
});

function openLightbox(photo) {
    currentActivePhotoId = photo.id;
    lightboxImg.src = photo.imageUrl || "";
    lightboxAvatar.src = photo.authorAvatar || "https://via.placeholder.com/40";
    lightboxAuthorName.textContent = photo.authorName || "Estudiante";
    lightboxDate.textContent = (photo.createdAt && typeof photo.createdAt.toDate === "function")
        ? photo.createdAt.toDate().toLocaleDateString()
        : "Recién subida";
    lightboxDesc.textContent = photo.description || "";
    btnViewFullSize.href = photo.imageUrl || "#";

    const canDelete = Boolean(currentUser && (isSupremeMod(currentUser) || currentUser.uid === photo.authorUid));
    btnDeletePhoto.style.display = canDelete ? "flex" : "none";

    lightboxModal.classList.add("open");
}

btnDeletePhoto.addEventListener("click", async () => {
    if (!currentActivePhotoId) return;
    try {
        await deleteDoc(doc(db, "photos", currentActivePhotoId));
        lightboxModal.classList.remove("open");
        showToast("Foto eliminada correctamente.");
        await loadPhotos();
    } catch (error) {
        console.error("Error al eliminar foto:", error);
        showToast("No se pudo eliminar la foto.", true);
    }
});
