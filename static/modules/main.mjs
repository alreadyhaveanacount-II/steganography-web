import init from "../pkg/rust_src.js";
import { extract_data_from_image, mix_data_in_image } from "./hider.mjs";

window.State = {
    "DisplayCanvas": null,
    "DisplayContext": null,
    "Password": "",
    "Content Salt": "",
    "Steganography Salt": "",
    "Plaintext": "",
    "Chip Amount": 64,
    "FileBuffer": null, // Armazena os bytes do arquivo selecionado
    "FileName": "secret_data"
};

async function process_new_image(event) {
    const target = event.target;
    const new_image = target.files[0];

    if (!new_image) return;

    try {
        const bitmap = await createImageBitmap(new_image, { 
            colorSpaceConversion: 'none' 
        });

        window.State["DisplayCanvas"].width = bitmap.width;
        window.State["DisplayCanvas"].height = bitmap.height;

        window.State["DisplayContext"].imageSmoothingEnabled = false;
        window.State["DisplayContext"].drawImage(bitmap, 0, 0);

        console.log("Imagem de cobertura carregada!");
        bitmap.close();
    } catch (err) {
        console.error("Erro ao processar imagem:", err);
    }
}

async function handle_file_select(event) {
    const file = event.target.files[0]; // Note o [0]
    if (!file) return;

    const buffer = await file.arrayBuffer();
    window.State["FileBuffer"] = new Uint8Array(buffer);
    window.State["FileName"] = file.name;
    
    // Feedback visual
    document.getElementById("file_info").innerText = `📎 ${file.name} (${(file.size/1024).toFixed(1)} KB)`;
    console.log("Arquivo pronto.");
}

async function hide_data() {
    const current_image = window.State["DisplayContext"].getImageData(0, 0, window.State["DisplayCanvas"].width, window.State["DisplayCanvas"].height);
    
    // Prioriza o arquivo binário. Se não houver, usa o campo de texto.
    let dataToHide;
    if (window.State["FileBuffer"]) {
        dataToHide = window.State["FileBuffer"];
    } else {
        const encoder = new TextEncoder();
        dataToHide = encoder.encode(window.State["Plaintext"] || "");
    }

    if (dataToHide.length === 0) {
        alert("Insira um texto ou selecione um arquivo primeiro.");
        return;
    }

    try {
        const new_img = await mix_data_in_image(
            current_image, 
            dataToHide, 
            window.State["Password"], 
            window.State["Steganography Salt"], 
            window.State["Content Salt"],
            window.State["Chip Amount"]
        );

        window.State["DisplayContext"].putImageData(new_img, 0, 0);
        console.log("Dados ocultados com DSSS.");
    } catch (err) {
        console.error("Erro ao ocultar dados:", err);
    }
}

async function reveal_data() {
    const current_image = window.State["DisplayContext"].getImageData(0, 0, window.State["DisplayCanvas"].width, window.State["DisplayCanvas"].height);
    
    const content_bytes = await extract_data_from_image(
        current_image, 
        window.State["Password"], 
        window.State["Steganography Salt"], 
        window.State["Content Salt"],
        window.State["Chip Amount"]
    );

    if (!content_bytes) {
        alert("Falha na extração. Verifique a senha e os sais.");
        return;
    }

    // 1. Tenta mostrar como texto no console
    try {
        const decoder = new TextDecoder();
        console.log("Conteúdo extraído:", decoder.decode(content_bytes));
    } catch (e) {
        console.log("Conteúdo extraído é binário.");
    }

    // 2. Dispara o download do arquivo extraído
    const blob = new Blob([content_bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = "revelado_" + window.State["FileName"];
    link.click();
    URL.revokeObjectURL(url);
}

async function run() {
    try {
        await init();
        console.log("WASM module loaded successfully");
    } catch (err) {
        console.error("Failed to initialize WASM:", err);
        alert("Failed to load encryption module. Please refresh the page.");
        return;
    }

    window.State["DisplayCanvas"] = document.getElementById("result");
    window.State["DisplayContext"] = window.State["DisplayCanvas"].getContext("2d", {
        willReadFrequently: true
    });

    // Inputs de configuração
    document.getElementById("image_input").onchange = process_new_image;

    document.getElementById("file_input").onchange = handle_file_select
    document.getElementById("password").oninput = (e) => window.State["Password"] = e.target.value;
    document.getElementById("crypto_salt").oninput = (e) => window.State["Content Salt"] = e.target.value;
    document.getElementById("chips").oninput = (e) => window.State["Chip Amount"] = Number(e.target.value) || 0;
    document.getElementById("stego_salt").oninput = (e) => window.State["Steganography Salt"] = e.target.value;
    document.getElementById("content").oninput = (e) => {
        window.State["Plaintext"] = e.target.value;
        window.State["FileBuffer"] = null; 
        document.getElementById("file_info").innerText = ""; // Limpa o nome do arquivo visualmente
    };

    // Botões de ação
    document.getElementById("reveal").onclick = reveal_data;
    document.getElementById("hide").onclick = hide_data;
    document.getElementById("download").onclick = () => {
        const link = document.createElement('a');
        link.download = 'stego_image.png';
        link.href = window.State["DisplayCanvas"].toDataURL('image/png');
        link.click();
    };
}

document.addEventListener("DOMContentLoaded", run);
