import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ToastProvider } from '../../toast/ToastProvider';
import { PacienteForm } from './PacienteForm';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

// Só o transporte é trocado; chamar() e mensagemDeErro() continuam os reais.
vi.mock('../../api/client', async (original) => ({
  ...(await original<typeof import('../../api/client')>()),
  api: { POST: post, PATCH: vi.fn() },
}));

z.config(z.locales.ptBR());

function montar() {
  const aoFechar = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <PacienteForm onFechar={aoFechar} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { aoFechar, user: userEvent.setup() };
}

describe('formulário de paciente', () => {
  beforeEach(() => post.mockReset());

  it('RN-001: sem CPF exige responsável e não envia nada', async () => {
    const { user } = montar();
    await user.type(screen.getByLabelText(/nome completo/i), 'Maria da Silva');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Sem CPF, informe o responsável.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('recusa CPF com dígitos verificadores inválidos', async () => {
    const { user } = montar();
    await user.type(screen.getByLabelText(/nome completo/i), 'Maria da Silva');
    await user.type(screen.getByLabelText('CPF'), '52998224726');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('CPF inválido.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('aplica máscara de CPF e celular enquanto digita', async () => {
    const { user } = montar();
    await user.type(screen.getByLabelText('CPF'), '52998224725');
    await user.type(screen.getByLabelText('Celular'), '11987654321');
    expect(screen.getByLabelText('CPF')).toHaveValue('529.982.247-25');
    expect(screen.getByLabelText('Celular')).toHaveValue('(11) 98765-4321');
  });

  it('envia só dígitos e nulos para o que ficou vazio (menor com responsável, sem CPF)', async () => {
    post.mockResolvedValue({
      error: { erro: 'parou aqui' },
      response: new Response(null, { status: 400 }),
    });
    const { user } = montar();
    await user.type(screen.getByLabelText(/nome completo/i), 'Edu Menor');
    await user.type(screen.getByLabelText('Nome do responsável'), 'Mãe do Edu');
    await user.type(screen.getByLabelText('Celular do responsável'), '11911112222');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [rota, { body }] = post.mock.calls[0];
    expect(rota).toBe('/pacientes');
    expect(body).toMatchObject({
      nome: 'Edu Menor',
      cpf: null,
      email: null,
      endereco: null,
      responsavel_nome: 'Mãe do Edu',
      responsavel_celular: '11911112222',
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('parou aqui');
  });

  it('é um diálogo acessível: foco no primeiro campo e Esc fecha', async () => {
    const { user, aoFechar } = montar();
    expect(screen.getByRole('dialog', { name: 'Novo paciente' })).toBeInTheDocument();
    expect(screen.getByLabelText(/nome completo/i)).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(aoFechar).toHaveBeenCalled();
  });
});
