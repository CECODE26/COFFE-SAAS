from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """
    Paginación estándar de la API.

    - Por defecto 20 resultados por página.
    - El cliente puede pedir más con ?page_size=N (máximo 500).
      El frontend (fetchAll) pide page_size=200 y sigue el enlace "next".
    """
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 500
