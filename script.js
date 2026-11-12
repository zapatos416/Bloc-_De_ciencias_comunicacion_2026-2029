/* ========================================== */
/* ARCHIVO 3: app.js */
/* ========================================== */
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, getDoc, setDoc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

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

// CONFIGURACIÓN DE MODERADOR SUPREMO (IGNACIO)
const SUPREME_MODERATOR_UID = "IGNACIO_ADMIN_UID_PLACEHOLDER"; 
const SUPREME_MODERATOR_EMAIL = "ignacio@universidad.edu"; // Puedes añadir correos de confianza

let currentUser = null;
let allPhotos = [];
let currentActivePhotoId = null;
let currentActivePhotoUrl = null;

// ELEMENTOS DOM
const photoGrid = document.getElementById("photoGrid");
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

// GESTIÓN DE AUTENTICACIÓN
btnLogin.addEventListener("click", async () => {
    if (!currentUser) {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            console.error("Error al iniciar sesión:", error);
        }
    } else {
        await signOut(auth);
    }
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        headerUserName.textContent = user.displayName || "Estudiante";
        headerUserAvatar.src = user.photoURL || "https://via.placeholder.com/40";
        btnLogin.textContent = "Cerrar sesión";
        
        // Verificar si es moderador supremo
        if (user.uid === SUPREME_MODERATOR_UID || user.email === SUPREME_MODERATOR_EMAIL) {
            navModeration.style.display = "flex";
        }

        // Registrar o verificar perfil de usuario en Firestore (Control de cambio de nombre de 10 días)
        await checkOrCreateUserProfile(user);
    } else {
        currentUser = null;
        headerUserName.textContent = "Invitado";
        headerUserAvatar.src = "https://via.placeholder.com/40";
        btnLogin.textContent = "Acceder";
        navModeration.style.display = "none";
    }
    loadPhotos();
});

// CONTROL DE PERFIL Y REGLA DE 10 DÍAS
async function checkOrCreateUserProfile(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        await setDoc(userRef, {
            displayName: user.displayName || "Estudiante",
            photoURL: user.photoURL,
            lastNamedChange: null
        });
    }
}

navProfile.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!currentUser) {
        alert("Inicia sesión para editar tu perfil.");
        return;
    }
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
        const data = userSnap.data();
        inputNewName.value = data.displayName;
        modalProfileAvatar.src = currentUser.photoURL;

        // Validar cooldown de 10 días
        if (data.lastNamedChange) {
            const lastChangeDate = data.lastNamedChange.toDate();
            const daysPassed = (new Date() - lastChangeDate) / (1000 * 60 * 60 * 24);
            if (daysPassed < 10) {
                const daysRemaining = Math.ceil(10 - daysPassed);
                nameCooldownNotice.textContent = `Faltan ${daysRemaining} días para que puedas volver a cambiar tu nombre.`;
                inputNewName.disabled = true;
                btnSaveProfile.disabled = true;
            } else {
                nameCooldownNotice.textContent = "Puedes actualizar tu nombre (límite de 1 vez cada 10 días).";
                inputNewName.disabled = false;
                btnSaveProfile.disabled = false;
            }
        } else {
            nameCooldownNotice.textContent = "Puedes actualizar tu nombre por primera vez.";
            inputNewName.disabled = false;
            btnSaveProfile.disabled = false;
        }
    }
    profileModal.style.display = "flex";
});

btnSaveProfile.addEventListener("click", async () => {
    if (!currentUser) return;
    const newName = inputNewName.value.trim();
    if (!newName) {
        alert("El nombre no puede estar vacío.");
        return;
    }

    const userRef = doc(db, "users", currentUser.uid);
    await setDoc(userRef, {
        displayName: newName,
        lastNamedChange: serverTimestamp()
    }, { merge: true });

    headerUserName.textContent = newName;
    alert("¡Nombre actualizado con éxito!");
    profileModal.style.display = "none";
});

// ABRIR / CERRAR MODALES
btnOpenUpload.addEventListener("click", () => {
    if (!currentUser) {
        alert("Debes iniciar sesión con Google para subir fotos.");
        return;
    }
    uploadModal.style.display = "flex";
});

document.querySelectorAll(".close-modal").forEach(btn => {
    btn.addEventListener("click", () => {
        uploadModal.style.display = "none";
        profileModal.style.display = "none";
    });
});

document.querySelector(".lightbox-close").addEventListener("click", () => {
    lightboxModal.style.display = "none";
});

// VISTA PREVIA DE FOTO SELECCIONADA DE LA GALERÍA
fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            imagePreview.src = event.target.result;
            imagePreviewContainer.style.display = "block";
        };
        reader.readAsDataURL(file);
    }
});

// SUBIR FOTO A FIREBASE STORAGE Y FIRESTORE
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
        // Subir a Storage
        const storageRef = ref(storage, `comunicasur/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);

        // Obtener nombre actual del usuario
        const userSnap = await getDoc(doc(db, "users", currentUser.uid));
        const authorName = userSnap.exists() ? userSnap.data().displayName : currentUser.displayName;

        // Guardar en Firestore
        await addDoc(collection(db, "photos"), {
            imageUrl: downloadURL,
            description: desc,
            authorName: authorName,
            authorUid: currentUser.uid,
            authorAvatar: currentUser.photoURL || "https://via.placeholder.com/40",
            createdAt: serverTimestamp()
        });

        uploadModal.style.display = "none";
        uploadForm.reset();
        imagePreviewContainer.style.display = "none";
        loadPhotos();
    } catch (error) {
        console.error("Error al subir foto:", error);
        alert("Hubo un error al subir la foto.");
    } finally {
        submitBtn.textContent = "Publicar en el Blog";
        submitBtn.disabled = false;
    }
});

// CARGAR Y RENDERIZAR FOTOS (ESTILO GOOGLE FOTOS)
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
        card.innerHTML = `
            <div class="photo-card-img-wrap">
                <img src="${photo.imageUrl}" alt="Recuerdo comunicación" loading="lazy">
            </div>
            <div class="photo-card-footer">
                <img src="${photo.authorAvatar}" alt="Autor">
                <div class="photo-card-meta">
                    <h5>${photo.authorName}</h5>
                    <p>${photo.description.substring(0, 35)}...</p>
                </div>
            </div>
        `;
        card.addEventListener("click", () => openLightbox(photo));
        photoGrid.appendChild(card);
    });
}

// BUSCADOR EN TIEMPO REAL
searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allPhotos.filter(p => 
        p.description.toLowerCase().includes(term) || 
        p.authorName.toLowerCase().includes(term)
    );
    renderPhotos(filtered);
});

// LIGHTBOX (VER FOTO GRANDE)
function openLightbox(photo) {
    currentActivePhotoId = photo.id;
    currentActivePhotoUrl = photo.imageUrl;

    lightboxImg.src = photo.imageUrl;
    lightboxAvatar.src = photo.authorAvatar;
    lightboxAuthorName.textContent = photo.authorName;
    lightboxDate.textContent = photo.createdAt ? new Date(photo.createdAt.toDate()).toLocaleDateString() : "Recién subida";
    lightboxDesc.textContent = photo.description;
    btnViewFullSize.href = photo.imageUrl;

    // Verificar si el usuario actual es el Moderador Supremo o el autor
    if (currentUser && (currentUser.uid === SUPREME_MODERATOR_UID || currentUser.email === SUPREME_MODERATOR_EMAIL || currentUser.uid === photo.authorUid)) {
        btnDeletePhoto.style.display = "flex";
    } else {
        btnDeletePhoto.style.display = "none";
    }

    lightboxModal.style.display = "flex";
}

// ELIMINAR FOTO (MODERADOR SUPREMO O DUEÑO)
btnDeletePhoto.addEventListener("click", async () => {
    if (!confirm("¿Estás seguro de eliminar esta foto?")) return;
    try {
        await deleteDoc(doc(db, "photos", currentActivePhotoId));
        lightboxModal.style.display = "none";
        loadPhotos();
        alert("Foto eliminada correctamente.");
    } catch (error) {
        console.error("Error al eliminar foto:", error);
    }
});