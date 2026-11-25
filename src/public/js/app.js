/* =============================================================================
   Cafetería Origen — lógica del sitio público
   ============================================================================= */
(function () {
  'use strict';

  var API = '/api';
  var CARRITO_KEY = 'origen.carrito';

  var estado = {
    tipo: '',
    variedad: '',
    q: '',
    carrito: cargarCarrito(),
  };

  /* ---------------------------------------------------------------- utils */
  function $(sel) { return document.querySelector(sel); }

  function money(valor) {
    var n = Number(valor || 0);
    return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
  }

  function raw(valor) {
    // FALLA: esta función NO escapa nada, devuelve el valor tal cual.
    // La forma correcta de renderizar texto del servidor es escaparHtml()
    // (o textContent en vez de innerHTML).
    return String(valor == null ? '' : valor);
  }

  function api(url, opciones) {
    return fetch(API + url, opciones).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function postJSON(url, cuerpo) {
    return api(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  function guardarCarrito() {
    try {
      localStorage.setItem(CARRITO_KEY, JSON.stringify(estado.carrito));
    } catch (e) { /* almacenamiento no disponible */ }
  }

  function cargarCarrito() {
    try {
      return JSON.parse(localStorage.getItem(CARRITO_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function escaparHtml(texto) {
    var div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
  }

  /* ------------------------------------------------------------- catálogo */
  function urlCatalogo() {
    var params = new URLSearchParams();
    if (estado.tipo) params.set('tipo', estado.tipo);
    if (estado.variedad) params.set('variedad', estado.variedad);
    if (estado.q) params.set('q', estado.q);
    var s = params.toString();
    return '/productos' + (s ? '?' + s : '');
  }

  function cargarProductos() {
    return api(urlCatalogo()).then(function (resp) {
      if (!resp.ok) {
        renderErrorProductos(resp.data && resp.data.error);
        return;
      }
      renderProductos(resp.data.productos);
      renderResultado(resp.data.filtros, resp.data.total);
    });
  }

  
function renderProductos(productos) {
  var grid = $('#productos-grid');

  if (!productos || productos.length === 0) {
    grid.textContent = '';

    var mensaje = document.createElement('p');
    mensaje.className = 'empty';
    mensaje.textContent = 'No encontramos productos con esos filtros.';

    grid.appendChild(mensaje);
    return;
  }

  grid.textContent = '';

  productos.forEach(function (p) {
    window.__productos[p.id] = p;

    var article = document.createElement('article');
    article.className = 'product-card';

    var top = document.createElement('div');
    top.className = 'product-top';

    var nombre = document.createElement('h3');
    nombre.className = 'product-name';
    nombre.textContent = p.nombre;

    var precio = document.createElement('span');
    precio.className = 'product-price';
    precio.textContent = money(p.precio);

    top.appendChild(nombre);
    top.appendChild(precio);

    var tags = document.createElement('div');
    tags.className = 'product-tags';

    function agregarTag(texto, clase) {
      var tag = document.createElement('span');
      tag.className = clase;
      tag.textContent = texto;
      tags.appendChild(tag);
    }

    agregarTag(p.tipo, 'tag');

    if (p.variedad) agregarTag(p.variedad, 'tag tag-origen');
    if (p.tamano) agregarTag(p.tamano, 'tag');

    var descripcion = document.createElement('p');
    descripcion.className = 'product-desc';
    descripcion.textContent = p.descripcion;

    var boton = document.createElement('button');
    boton.className = 'btn btn-ghost btn-agregar';
    boton.setAttribute('data-id', p.id);
    boton.textContent = 'Agregar';

    article.appendChild(top);
    article.appendChild(tags);
    article.appendChild(descripcion);
    article.appendChild(boton);

    grid.appendChild(article);
  });
}


  function renderResultado(filtros, total) {
  var el = $('#resultado-busqueda');

  el.textContent = '';

  if (filtros && filtros.q) {
    var strong = document.createElement('strong');
    strong.textContent = filtros.q;

    el.appendChild(document.createTextNode('Resultados para '));
    el.appendChild(strong);
    el.appendChild(document.createTextNode(' — ' + total + ' producto(s)'));
  } else {
    el.textContent = total + ' producto(s) en el menú';
  }
}
  function renderErrorProductos(mensaje) {
  var grid = $('#productos-grid');

  var error = document.createElement('p');
  error.className = 'empty';
  error.textContent = 'No se pudo cargar el menú: ' +
    (mensaje || 'error desconocido');

  grid.textContent = '';
  grid.appendChild(error);
}

  /* --------------------------------------------------------------- carrito */
  function agregarAlCarrito(productoId) {
    var existente = null;
    for (var i = 0; i < estado.carrito.length; i++) {
      if (String(estado.carrito[i].id) === String(productoId)) existente = estado.carrito[i];
    }
    if (existente) {
      existente.cantidad += 1;
    } else {
      estado.carrito.push({
        id: productoId,
        nombre: window.__productos[productoId] ? window.__productos[productoId].nombre : 'Producto',
        precio: window.__productos[productoId] ? window.__productos[productoId].precio : 0,
        cantidad: 1,
      });
    }
    guardarCarrito();
    renderCarrito();
  }

  function cambiarCantidad(indice, delta) {
    var item = estado.carrito[indice];
    if (!item) return;
    item.cantidad += delta;
    if (item.cantidad <= 0) estado.carrito.splice(indice, 1);
    guardarCarrito();
    renderCarrito();
  }

  function quitarDelCarrito(indice) {
    estado.carrito.splice(indice, 1);
    guardarCarrito();
    renderCarrito();
  }

  function renderCarrito() {
  var cont = $('#carrito');
  var lista = $('#resumen-carrito');
  var total = 0;

  cont.textContent = '';
  lista.textContent = '';

  if (estado.carrito.length === 0) {
    var mensaje = document.createElement('p');
    mensaje.className = 'empty';
    mensaje.textContent = 'El carrito está vacío.';

    cont.appendChild(mensaje);
    $('#resumen-total').textContent = money(0);
    return;
  }

  estado.carrito.forEach(function (item, i) {
    var subtotal = item.precio * item.cantidad;
    total += subtotal;

    // Contenedor del producto
    var cartItem = document.createElement('div');
    cartItem.className = 'cart-item';

    // Nombre y precio unitario
    var info = document.createElement('div');

    var nombre = document.createElement('div');
    nombre.className = 'cart-item-name';
    nombre.textContent = item.nombre;

    var meta = document.createElement('div');
    meta.className = 'cart-item-meta';
    meta.textContent = money(item.precio) + ' c/u';

    info.appendChild(nombre);
    info.appendChild(meta);

    // Control de cantidad
    var cantidadControl = document.createElement('div');
    cantidadControl.className = 'qty-control';

    var menos = document.createElement('button');
    menos.type = 'button';
    menos.setAttribute('data-acc', 'menos');
    menos.setAttribute('data-i', i);
    menos.textContent = '−';

    var cantidad = document.createElement('span');
    cantidad.textContent = item.cantidad;

    var mas = document.createElement('button');
    mas.type = 'button';
    mas.setAttribute('data-acc', 'mas');
    mas.setAttribute('data-i', i);
    mas.textContent = '+';

    cantidadControl.appendChild(menos);
    cantidadControl.appendChild(cantidad);
    cantidadControl.appendChild(mas);

    // Subtotal y botón quitar
    var acciones = document.createElement('div');

    var precio = document.createElement('div');
    precio.className = 'cart-item-price';
    precio.textContent = money(subtotal);

    var quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.className = 'link-danger';
    quitar.setAttribute('data-acc', 'quitar');
    quitar.setAttribute('data-i', i);
    quitar.textContent = 'Quitar';

    acciones.appendChild(precio);
    acciones.appendChild(quitar);

    // Unir elementos
    cartItem.appendChild(info);
    cartItem.appendChild(cantidadControl);
    cartItem.appendChild(acciones);

    cont.appendChild(cartItem);

    // Resumen del carrito
    var li = document.createElement('li');

    var detalle = document.createElement('span');
    detalle.textContent = item.nombre + ' × ' + item.cantidad;

    var subtotalResumen = document.createElement('span');
    subtotalResumen.textContent = money(subtotal);

    li.appendChild(detalle);
    li.appendChild(subtotalResumen);

    lista.appendChild(li);
  });

  $('#resumen-total').textContent = money(total);
}

  /* ---------------------------------------------------------------- pedidos */
  function enviarPedido(evento) {
    evento.preventDefault();
    var feedback = $('#pedido-feedback');
    feedback.className = 'form-feedback';
    feedback.textContent = 'Enviando…';

    postJSON('/pedidos', {
      mesa: $('#pedido-mesa').value,
      cliente: $('#pedido-cliente').value,
      items: estado.carrito.map(function (item) {
        return { productoId: item.id, cantidad: item.cantidad };
      }),
    }).then(function (resp) {
      if (!resp.ok) {
        // FALLA (XSS reflejado): el mensaje del servidor se pinta con innerHTML.
        feedback.className = 'form-feedback is-error';
        feedback.innerHTML = 'No pudimos enviar el pedido: ' + (resp.data.error || 'error desconocido');
        return;
      }
      feedback.className = 'form-feedback is-error';
      feedback.textContent = 'No pudimos enviar el pedido: ' +
      (resp.data.error || 'error desconocido');
      estado.carrito = [];
      guardarCarrito();
      renderCarrito();
      $('#form-pedido').reset();
    }).catch(function () {
      feedback.className = 'form-feedback is-error';
      feedback.textContent = 'Error de conexión con el servidor.';
    });
  }

  /* --------------------------------------------------------------- reseñas */
  function cargarReseñas() {
  return api('/comentarios').then(function (resp) {
    var cont = $('#lista-resenas');
    cont.textContent = '';

    if (!resp.ok || !resp.data.comentarios || resp.data.comentarios.length === 0) {
      var mensaje = document.createElement('p');
      mensaje.className = 'empty';
      mensaje.textContent = 'Todavía no hay reseñas. ¡Sé el primero!';
      cont.appendChild(mensaje);
      return;
    }
      // SOLUCIONADO
      // FALLA (XSS almacenado): el texto de la reseña viene de la base y se
      // inyecta con innerHTML → se ejecuta en el navegador de cada visitante.
            
      cont.textContent = '';

      resp.data.comentarios.forEach(function (c) {
        var article = document.createElement('article');
        article.className = 'review';

        var head = document.createElement('div');
        head.className = 'review-head';

        var author = document.createElement('span');
        author.className = 'review-author';
        author.textContent = c.autor;

        var stars = document.createElement('span');
        stars.className = 'review-stars';

        var cantidadEstrellas = Number(c.calificacion || 0);
        for (var i = 0; i < cantidadEstrellas; i++) {
          stars.textContent += '★';
        }

        var texto = document.createElement('p');
        texto.className = 'review-text';
        texto.textContent = c.texto;

        head.appendChild(author);
        head.appendChild(stars);

        article.appendChild(head);
        article.appendChild(texto);

        cont.appendChild(article);
      });

    });
  }

  function enviarReseña(evento) {
    evento.preventDefault();
    var feedback = $('#resena-feedback');
    feedback.className = 'form-feedback';
    feedback.textContent = 'Publicando…';

    postJSON('/comentarios', {
      autor: $('#resena-autor').value,
      texto: $('#resena-texto').value,
      calificacion: Number($('#resena-calificacion').value),
    }).then(function (resp) {
      if (!resp.ok) {
        feedback.className = 'form-feedback is-error';
        feedback.textContent = 'No se pudo publicar: ' +
        (resp.data.error || 'error desconocido');
        return;
      }
      feedback.className = 'form-feedback is-ok';
      feedback.textContent = '¡Gracias por tu reseña!';
      $('#form-resena').reset();
      cargarReseñas();
    });
  }

  /* ------------------------------------------------------------- listeners */
  function init() {
    window.__productos = {};

    // Filtros
    document.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        document.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        estado.tipo = chip.getAttribute('data-tipo');
        cargarProductos();
      });
    });

    $('#filtro-variedad').addEventListener('change', function (e) {
      estado.variedad = e.target.value;
      cargarProductos();
    });

    var temporizador = null;
    $('#filtro-busqueda').addEventListener('input', function (e) {
      estado.q = e.target.value;
      clearTimeout(temporizador);
      temporizador = setTimeout(cargarProductos, 250);
    });

    // Carrito (delegación de eventos)
    $('#productos-grid').addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-agregar');
      if (!btn) return;
      agregarAlCarrito(btn.getAttribute('data-id'));
    });

    $('#carrito').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var i = Number(btn.getAttribute('data-i'));
      var accion = btn.getAttribute('data-acc');
      if (accion === 'mas') cambiarCantidad(i, 1);
      else if (accion === 'menos') cambiarCantidad(i, -1);
      else if (accion === 'quitar') quitarDelCarrito(i);
    });

    $('#form-pedido').addEventListener('submit', enviarPedido);
    $('#form-resena').addEventListener('submit', enviarReseña);

    // Carga inicial
    api(urlCatalogo()).then(function (resp) {
      if (resp.ok) {
        (resp.data.productos || []).forEach(function (p) { window.__productos[p.id] = p; });
        renderProductos(resp.data.productos);
        renderResultado(resp.data.filtros, resp.data.total);
      } else {
        renderErrorProductos(resp.data.error);
      }
    });
    cargarReseñas();
    renderCarrito();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
